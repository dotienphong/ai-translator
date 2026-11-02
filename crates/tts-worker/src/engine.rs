//! Suy luận v3 Turbo bằng ONNX Runtime (`ort`): prefill → vòng (acoustic 16 codebook → lấy mẫu → decode_step) → codec.
//! Port từ `vieneu/_v3_turbo_engine/onnx_runtime_lite.py` (SDK `vieneu` 3.8.3); phần NumPy (embedding, neo giọng, đầu ra,
//! lấy mẫu, dựng prompt) viết lại bằng Rust, đối chiếu với SDK bằng `tests/engine_ref.rs`.

use crate::config::Config;
use crate::npz::{Array, read_npz};
use crate::rep_history::RepetitionHistory;
use crate::sampling::{Params, Rng, sample};
use ort::environment::Environment;
use ort::session::{Session, builder::GraphOptimizationLevel};
use ort::value::{DynValue, Tensor};
use std::path::Path;
use tokenizers::Tokenizer;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

/// Lỗi báo việc sinh đã bị hủy giữa chừng (`cancelled` trả về `true`).
#[derive(Debug)]
pub struct Cancelled;

impl std::fmt::Display for Cancelled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("đã hủy")
    }
}

impl std::error::Error for Cancelled {}

/// Tham số sinh khung (mặc định theo SDK).
#[derive(Debug, Clone, Copy)]
pub struct GenParams {
    pub sampling: Params,
    pub rep_window: usize,
    pub max_new_frames: usize,
}

impl Default for GenParams {
    fn default() -> Self {
        Self {
            sampling: Params {
                temperature: 0.8,
                top_k: 25,
                top_p: 0.95,
                rep_pen: 1.2,
            },
            rep_window: crate::rep_history::DEFAULT_REP_WINDOW,
            max_new_frames: 300,
        }
    }
}

/// Thời gian cộng dồn từng khâu (đo, không chứa dữ liệu người dùng).
#[derive(Debug, Default, Clone, Copy)]
pub struct Profile {
    pub prefill: std::time::Duration,
    pub decode_step: std::time::Duration,
    pub acoustic: std::time::Duration,
    pub heads_sampling: std::time::Duration,
    pub codec: std::time::Duration,
    pub frames: usize,
}

/// Trạng thái sinh khung giữa các lần gọi [`Engine::next_frame`].
pub struct GenState {
    past: Vec<(DynValue, DynValue)>,
    last: Vec<f32>,
    hist: Option<RepetitionHistory>,
    anchor: Vec<f32>,
    t_prompt: usize,
    /// Số khung đã sinh.
    pub t: usize,
}

/// Trạng thái bộ giải mã codec dạng luồng: các tensor nhớ, đi từ đầu ra của lượt này vào đầu vào của lượt sau.
pub struct CodecStream {
    /// `(tên đầu vào, tên đầu ra, giá trị)`.
    state: Vec<(String, String, DynValue)>,
}

pub struct Engine {
    #[allow(dead_code)]
    env: Environment,
    /// Cộng dồn từ lần `take_profile` trước.
    pub prof: Profile,
    pub cfg: Config,
    text_emb: Array,
    audio_emb: Array,
    xvec_w: Array,
    xvec_b: Vec<f32>,
    xvec_ln_w: Vec<f32>,
    xvec_ln_b: Vec<f32>,
    xvec_ln_eps: f32,
    tokenizer: Tokenizer,
    pre: Session,
    dec: Session,
    ac: Session,
    codec: Session,
    codec_step: Session,
    codec_spec: serde_json::Value,
}

/// Số luồng tính mặc định: nửa số lõi logic, từ 1 đến 8 (đo của SDK trên i5-12400F: nhiều hơn chỉ thêm tranh chấp vì
/// các phép nhân ma trận rất nhỏ). `0` = tự chọn.
pub fn default_threads() -> usize {
    (std::thread::available_parallelism().map_or(4, |n| n.get()) / 2).clamp(1, 8)
}

fn session(env: &Environment, path: &Path, threads: usize) -> Result<Session> {
    let threads = if threads == 0 { default_threads() } else { threads };
    // Tắt vòng quay chờ (spinning): giữa hai lượt chạy nhỏ, các luồng không đốt CPU, nhường lõi cho ASR và dịch.
    let mut b = Session::builder(env)?
        .with_optimization_level(GraphOptimizationLevel::Level3)?
        .with_intra_threads(threads)?
        .with_inter_threads(1)?
        .with_intra_op_spinning(false)?
        .with_inter_op_spinning(false)?;
    Ok(b.commit_from_file(path)?)
}

fn take(m: &mut std::collections::HashMap<String, Array>, k: &str) -> Result<Array> {
    m.remove(k)
        .ok_or_else(|| format!("thiếu {k} trong vieneu_v3_heads.npz").into())
}

/// Tích vô hướng cộng tuần tự từ trái sang phải. Cố ý KHÔNG dùng nhiều bộ cộng song song: đổi thứ tự cộng làm logit lệch ~1e-6,
/// đủ lật các lựa chọn greedy gần hòa và làm mất khả năng đối chiếu chính xác từng khung với SDK (tests/engine_ref.rs).
fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// Số hàng tối thiểu để đáng chia cho nhiều luồng (dưới ngưỡng này chia việc tốn hơn lợi).
const PAR_MIN_ROWS: usize = 256;

/// `rows (n×h) · v (h)` → n. Bảng lớn (1024×768, đọc ~3 MB mỗi lần, 16 lần mỗi khung) bị giới hạn bởi băng thông bộ nhớ nên chia
/// hàng cho nhiều luồng; mỗi hàng vẫn được tính tuần tự y hệt nên kết quả không phụ thuộc cách chia.
fn matvec(rows: &[f32], h: usize, v: &[f32]) -> Vec<f32> {
    use rayon::prelude::*;
    if rows.len() / h >= PAR_MIN_ROWS {
        rows.par_chunks_exact(h).map(|r| dot(r, v)).collect()
    } else {
        rows.chunks_exact(h).map(|r| dot(r, v)).collect()
    }
}

fn f32_tensor(shape: &[usize], data: Vec<f32>) -> Result<DynValue> {
    Ok(Tensor::from_array((shape.to_vec(), data))?.into_dyn())
}

fn i32_tensor(shape: &[usize], data: Vec<i32>) -> Result<DynValue> {
    Ok(Tensor::from_array((shape.to_vec(), data))?.into_dyn())
}

fn i64_tensor(shape: &[usize], data: Vec<i64>) -> Result<DynValue> {
    Ok(Tensor::from_array((shape.to_vec(), data))?.into_dyn())
}

impl Engine {
    /// `model_dir`: thư mục `onnx_update/` (hoặc `onnx_int8/`); `codec_dir`: thư mục codec MOSS.
    /// `ort_lib`: đường dẫn thư viện ONNX Runtime (onnxruntime.dll / libonnxruntime.dylib); `None` thì theo `ORT_DYLIB_PATH`.
    pub fn load(model_dir: &Path, codec_dir: &Path, ort_lib: Option<&Path>, threads: usize) -> Result<Self> {
        let env = match ort_lib {
            Some(p) => ort::init_from(p)?.build()?,
            None => ort::init().build()?,
        };
        let cfg = Config::parse(&std::fs::read_to_string(model_dir.join("config.json"))?)?;
        let mut z = read_npz(&model_dir.join("vieneu_v3_heads.npz"))?;
        let text_emb = take(&mut z, "text_emb")?;
        let audio_emb = take(&mut z, "audio_emb")?;
        let xvec_w = take(&mut z, "xvec_w")?;
        let xvec_b = take(&mut z, "xvec_b")?.data;
        let xvec_ln_w = take(&mut z, "xvec_ln_w")?.data;
        let xvec_ln_b = take(&mut z, "xvec_ln_b")?.data;
        let xvec_ln_eps = take(&mut z, "xvec_ln_eps")?.data.first().copied().unwrap_or(1e-5);
        let tokenizer = Tokenizer::from_file(model_dir.join("tokenizer.json")).map_err(|e| e.to_string())?;
        let pre = session(&env, &model_dir.join("vieneu_prefill.onnx"), threads)?;
        let dec = session(&env, &model_dir.join("vieneu_decode_step.onnx"), threads)?;
        let ac = session(&env, &model_dir.join("vieneu_acoustic_cached.onnx"), threads)?;
        let codec = session(&env, &codec_dir.join("moss_audio_tokenizer_decode_full.onnx"), threads)?;
        let codec_step = session(&env, &codec_dir.join("moss_audio_tokenizer_decode_step.onnx"), threads)?;
        let meta: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(
            codec_dir.join("codec_browser_onnx_meta.json"),
        )?)?;
        let codec_spec = meta
            .get("streaming_decode")
            .cloned()
            .ok_or("codec_browser_onnx_meta.json thiếu streaming_decode")?;
        Ok(Self {
            env,
            prof: Profile::default(),
            cfg,
            text_emb,
            audio_emb,
            xvec_w,
            xvec_b,
            xvec_ln_w,
            xvec_ln_b,
            xvec_ln_eps,
            tokenizer,
            pre,
            dec,
            ac,
            codec,
            codec_step,
            codec_spec,
        })
    }

    /// Lấy và xóa số đo cộng dồn.
    pub fn take_profile(&mut self) -> Profile {
        std::mem::take(&mut self.prof)
    }

    fn h(&self) -> usize {
        self.cfg.hidden_size
    }

    /// x-vector 192 chiều → neo giọng (H): Linear rồi LayerNorm.
    pub fn speaker_anchor(&self, spk: &[f32]) -> Result<Vec<f32>> {
        if spk.len() != self.cfg.speaker_embedding_dim || spk.iter().all(|&x| x == 0.0) {
            return Err("speaker_emb sai kích thước hoặc toàn 0".into());
        }
        let h = self.h();
        let mut v: Vec<f32> = matvec(&self.xvec_w.data, spk.len(), spk);
        for (x, b) in v.iter_mut().zip(&self.xvec_b) {
            *x += b;
        }
        let mean = v.iter().sum::<f32>() / h as f32;
        let var = v.iter().map(|x| (x - mean) * (x - mean)).sum::<f32>() / h as f32;
        let inv = 1.0 / (var + self.xvec_ln_eps).sqrt();
        Ok(v.iter()
            .enumerate()
            .map(|(i, x)| (x - mean) * inv * self.xvec_ln_w[i] + self.xvec_ln_b[i])
            .collect())
    }

    /// Dựng các hàng (T × (n_vq+1)) của prompt: `[style, tps, phoneme…, tpe]` rồi các hàng mã tham chiếu.
    /// `ref_codes`: (Tref × n_vq) dàn phẳng.
    pub fn build_rows(&self, phonemes: &str, ref_codes: &[i64]) -> Result<(Vec<i64>, usize)> {
        let w = self.cfg.n_vq + 1;
        let enc = self.tokenizer.encode(phonemes, false).map_err(|e| e.to_string())?;
        let mut text: Vec<i64> = vec![self.cfg.default_style_token_id, self.cfg.text_prompt_start_token_id];
        text.extend(enc.get_ids().iter().map(|&i| i64::from(i)));
        text.push(self.cfg.text_prompt_end_token_id);
        let mut rows = Vec::with_capacity((text.len() + ref_codes.len() / self.cfg.n_vq) * w);
        for t in &text {
            rows.push(*t);
            rows.extend(std::iter::repeat_n(self.cfg.audio_pad_token_id, self.cfg.n_vq));
        }
        for r in ref_codes.chunks_exact(self.cfg.n_vq) {
            rows.push(self.cfg.audio_ref_slot_token_id);
            rows.extend_from_slice(r);
        }
        let t = rows.len() / w;
        Ok((rows, t))
    }

    /// Hàng id → embedding (T × H): embedding chữ + tổng embedding âm theo từng codebook (bỏ ô đệm) + neo giọng.
    pub fn embed_rows(&self, rows: &[i64], anchor: &[f32]) -> Vec<f32> {
        let (h, nvq) = (self.h(), self.cfg.n_vq);
        let w = nvq + 1;
        let va = self.audio_emb.data.len() / (nvq * h);
        let mut out = Vec::with_capacity(rows.len() / w * h);
        for row in rows.chunks_exact(w) {
            let mut e: Vec<f32> = self.text_emb.data[row[0] as usize * h..][..h].to_vec();
            for ch in 0..nvq {
                let id = row[ch + 1];
                if id != self.cfg.audio_pad_token_id {
                    let base = (ch * va + id as usize) * h;
                    for (x, a) in e.iter_mut().zip(&self.audio_emb.data[base..base + h]) {
                        *x += a;
                    }
                }
            }
            for (x, a) in e.iter_mut().zip(anchor) {
                *x += a;
            }
            out.extend(e);
        }
        out
    }

    /// Chạy prefill và dựng trạng thái sinh khung. `anchor` là neo giọng đã tính bằng [`Engine::speaker_anchor`].
    pub fn begin(&mut self, prompt: Vec<f32>, anchor: &[f32], p: &GenParams) -> Result<GenState> {
        let (h, nvq, nl) = (self.h(), self.cfg.n_vq, self.cfg.num_hidden_layers);
        let t_prompt = prompt.len() / h;
        let t_pre = std::time::Instant::now();
        let mut out = self
            .pre
            .run(vec![("inputs_embeds", f32_tensor(&[1, t_prompt, h], prompt)?)])?;
        self.prof.prefill += t_pre.elapsed();
        let hidden = out["hidden"].try_extract_tensor::<f32>()?.1.to_vec();
        let last: Vec<f32> = hidden[(t_prompt - 1) * h..t_prompt * h].to_vec();
        let mut past: Vec<(DynValue, DynValue)> = Vec::with_capacity(nl);
        for i in 0..nl {
            let k = out.remove(format!("present_k_{i}")).ok_or("thiếu present_k")?;
            let v = out.remove(format!("present_v_{i}")).ok_or("thiếu present_v")?;
            past.push((k, v));
        }
        let hist = if (p.sampling.rep_pen - 1.0).abs() > 1e-6 {
            Some(RepetitionHistory::new(nvq, p.rep_window))
        } else {
            None
        };
        Ok(GenState {
            past,
            last,
            hist,
            anchor: anchor.to_vec(),
            t_prompt,
            t: 0,
        })
    }

    /// Sinh một khung: trả `(mã, eos)`. Khung có EOS vẫn được trả (như SDK) và sau đó không chạy decode_step nữa.
    pub fn next_frame(&mut self, st: &mut GenState, p: &GenParams, rng: &mut Rng) -> Result<(Vec<i64>, bool)> {
        let (h, nvq, nl) = (self.h(), self.cfg.n_vq, self.cfg.num_hidden_layers);
        let (codes, eos) = self.acoustic_frame(&st.last, p, st.hist.as_mut(), rng)?;
        if !eos && st.t + 1 < p.max_new_frames {
            let mut row = Vec::with_capacity(nvq + 1);
            row.push(self.cfg.speech_generation_start_token_id);
            row.extend_from_slice(&codes);
            let emb = self.embed_rows(&row, &st.anchor);
            let mut inputs: Vec<(String, DynValue)> = vec![
                ("inputs_embeds".into(), f32_tensor(&[1, 1, h], emb)?),
                (
                    "position_ids".into(),
                    i64_tensor(&[1, 1], vec![(st.t_prompt + st.t) as i64])?,
                ),
            ];
            for (i, (k, v)) in st.past.drain(..).enumerate() {
                inputs.push((format!("past_k_{i}"), k));
                inputs.push((format!("past_v_{i}"), v));
            }
            let t_dec = std::time::Instant::now();
            let mut o = self.dec.run(inputs)?;
            self.prof.decode_step += t_dec.elapsed();
            st.last = o["hidden"].try_extract_tensor::<f32>()?.1[..h].to_vec();
            for i in 0..nl {
                let k = o.remove(format!("present_k_{i}")).ok_or("thiếu present_k")?;
                let v = o.remove(format!("present_v_{i}")).ok_or("thiếu present_v")?;
                st.past.push((k, v));
            }
        }
        st.t += 1;
        Ok((codes, eos))
    }

    /// Sinh các khung mã âm thanh (mỗi khung n_vq mã). Khung cuối (có EOS) cũng nằm trong kết quả, như SDK.
    pub fn generate(
        &mut self,
        prompt: Vec<f32>,
        anchor: &[f32],
        p: &GenParams,
        rng: &mut Rng,
        cancelled: &dyn Fn() -> bool,
    ) -> Result<Vec<Vec<i64>>> {
        let mut st = self.begin(prompt, anchor, p)?;
        let mut frames: Vec<Vec<i64>> = Vec::new();
        for _ in 0..p.max_new_frames {
            if cancelled() {
                return Err(Box::new(Cancelled));
            }
            let (codes, eos) = self.next_frame(&mut st, p, rng)?;
            frames.push(codes);
            if eos {
                break;
            }
        }
        Ok(frames)
    }

    /// Chuẩn bị prompt cho một đoạn âm vị: `(prompt_embeds, anchor)`.
    pub fn prepare(&self, phonemes: &str, spk: &[f32], ref_codes: &[i64]) -> Result<(Vec<f32>, Vec<f32>)> {
        let anchor = self.speaker_anchor(spk)?;
        let (rows, _) = self.build_rows(phonemes, ref_codes)?;
        Ok((self.embed_rows(&rows, &anchor), anchor))
    }

    /// Một khung: 16 lượt chạy acoustic (có cache) + lấy mẫu từng codebook; EOS lấy từ logit chữ của ô đầu.
    fn acoustic_frame(
        &mut self,
        cond: &[f32],
        p: &GenParams,
        mut hist: Option<&mut RepetitionHistory>,
        rng: &mut Rng,
    ) -> Result<(Vec<i64>, bool)> {
        let (h, nvq) = (self.h(), self.cfg.n_vq);
        let va = self.audio_emb.data.len() / (nvq * h);
        let (nh, l_loc) = (self.cfg.local_num_attention_heads, self.cfg.local_num_hidden_layers);
        let hd = h / nh;
        let sgs = self.cfg.speech_generation_start_token_id as usize;
        let mut tok = cond.to_vec();
        tok.extend_from_slice(&self.text_emb.data[sgs * h..(sgs + 1) * h]);
        let mut inputs: Vec<(String, DynValue)> = vec![
            ("token_emb".into(), f32_tensor(&[1, 2, h], tok)?),
            ("position_ids".into(), i64_tensor(&[1, 2], vec![0, 1])?),
        ];
        for i in 0..l_loc {
            inputs.push((format!("past_k_{i}"), f32_tensor(&[1, nh, 0, hd], vec![])?));
            inputs.push((format!("past_v_{i}"), f32_tensor(&[1, nh, 0, hd], vec![])?));
        }
        let t_ac = std::time::Instant::now();
        let mut o = self.ac.run(inputs)?;
        self.prof.acoustic += t_ac.elapsed();
        let hid = o["hidden"].try_extract_tensor::<f32>()?.1.to_vec();
        let slot0 = hid[..h].to_vec();
        let mut cur = hid[h..2 * h].to_vec();
        let mut past: Vec<(DynValue, DynValue)> = Vec::new();
        for i in 0..l_loc {
            past.push((
                o.remove(format!("present_k_{i}")).ok_or("thiếu present_k")?,
                o.remove(format!("present_v_{i}")).ok_or("thiếu present_v")?,
            ));
        }
        drop(o);
        let mut codes: Vec<i64> = Vec::with_capacity(nvq);
        for ch in 0..nvq {
            let table = &self.audio_emb.data[ch * va * h..(ch + 1) * va * h];
            let t_hs = std::time::Instant::now();
            let logits = matvec(table, h, &cur);
            let prev: Vec<usize> = hist.as_ref().map(|hh| hh.channel(ch).codes()).unwrap_or_default();
            let code = sample(&logits, &p.sampling, &prev, rng.next_f32());
            if let Some(hh) = hist.as_deref_mut() {
                hh.channel_mut(ch).add(code as u32);
            }
            codes.push(code as i64);
            self.prof.heads_sampling += t_hs.elapsed();
            if ch + 1 < nvq {
                let prev_table = &self.audio_emb.data[ch * va * h..(ch + 1) * va * h];
                let emb = prev_table[code * h..(code + 1) * h].to_vec();
                let mut inputs: Vec<(String, DynValue)> = vec![
                    ("token_emb".into(), f32_tensor(&[1, 1, h], emb)?),
                    ("position_ids".into(), i64_tensor(&[1, 1], vec![(ch + 2) as i64])?),
                ];
                for (i, (k, v)) in past.drain(..).enumerate() {
                    inputs.push((format!("past_k_{i}"), k));
                    inputs.push((format!("past_v_{i}"), v));
                }
                let t_ac = std::time::Instant::now();
                let mut o = self.ac.run(inputs)?;
                self.prof.acoustic += t_ac.elapsed();
                cur = o["hidden"].try_extract_tensor::<f32>()?.1[..h].to_vec();
                for i in 0..l_loc {
                    past.push((
                        o.remove(format!("present_k_{i}")).ok_or("thiếu present_k")?,
                        o.remove(format!("present_v_{i}")).ok_or("thiếu present_v")?,
                    ));
                }
            }
        }
        let vt = self.text_emb.data.len() / h;
        let t_tl = std::time::Instant::now();
        let text_logits = matvec(&self.text_emb.data[..vt * h], h, &slot0);
        self.prof.heads_sampling += t_tl.elapsed();
        self.prof.frames += 1;
        let eos = crate::sampling::argmax(&text_logits) == self.cfg.speech_generation_end_token_id as usize;
        Ok((codes, eos))
    }

    /// Mã (T × n_vq) → PCM mono 48 kHz (trung bình hai kênh của codec).
    pub fn decode(&mut self, frames: &[Vec<i64>]) -> Result<Vec<f32>> {
        let t = frames.len();
        let codes: Vec<i32> = frames.iter().flat_map(|f| f.iter().map(|&c| c as i32)).collect();
        let a = Tensor::from_array((vec![1usize, t, self.cfg.n_vq], codes))?.into_dyn();
        let l = Tensor::from_array((vec![1usize], vec![t as i32]))?.into_dyn();
        let t_cd = std::time::Instant::now();
        let out = self.codec.run(vec![("audio_codes", a), ("audio_code_lengths", l)])?;
        self.prof.codec += t_cd.elapsed();
        let (shape, data) = out["audio"].try_extract_tensor::<f32>()?;
        let (c, s) = (shape[1] as usize, shape[2] as usize);
        Ok((0..s)
            .map(|i| (0..c).map(|ch| data[ch * s + i]).sum::<f32>() / c as f32)
            .collect())
    }

    /// Trạng thái rỗng cho bộ giải mã codec dạng luồng (ô nhớ vị trí khởi tạo -1 đánh dấu chỗ trống).
    pub fn codec_stream_new(&self) -> Result<CodecStream> {
        let sd = &self.codec_spec;
        let shape = |v: &serde_json::Value| -> Result<Vec<usize>> {
            Ok(v.as_array()
                .ok_or("shape không phải mảng")?
                .iter()
                .map(|x| x.as_u64().unwrap_or(0) as usize)
                .collect())
        };
        let name = |a: &serde_json::Value, k: &str| -> Result<String> {
            Ok(a.get(k)
                .and_then(|x| x.as_str())
                .ok_or_else(|| format!("thiếu {k} trong streaming_decode"))?
                .to_string())
        };
        let mut state = Vec::new();
        for t in sd["transformer_offsets"]
            .as_array()
            .ok_or("thiếu transformer_offsets")?
        {
            let sh = shape(&t["shape"])?;
            let n = sh.iter().product();
            state.push((
                name(t, "input_name")?,
                name(t, "output_name")?,
                i32_tensor(&sh, vec![0; n])?,
            ));
        }
        for a in sd["attention_caches"].as_array().ok_or("thiếu attention_caches")? {
            let (osh, csh, psh) = (
                shape(&a["offset_shape"])?,
                shape(&a["cache_shape"])?,
                shape(&a["positions_shape"])?,
            );
            let (on, cn, pn): (usize, usize, usize) =
                (osh.iter().product(), csh.iter().product(), psh.iter().product());
            state.push((
                name(a, "offset_input_name")?,
                name(a, "offset_output_name")?,
                i32_tensor(&osh, vec![0; on])?,
            ));
            state.push((
                name(a, "cached_keys_input_name")?,
                name(a, "cached_keys_output_name")?,
                f32_tensor(&csh, vec![0.0; cn])?,
            ));
            state.push((
                name(a, "cached_values_input_name")?,
                name(a, "cached_values_output_name")?,
                f32_tensor(&csh, vec![0.0; cn])?,
            ));
            state.push((
                name(a, "cached_positions_input_name")?,
                name(a, "cached_positions_output_name")?,
                i32_tensor(&psh, vec![-1; pn])?,
            ));
        }
        Ok(CodecStream { state })
    }

    /// Giải mã thêm một nhóm khung (K × n_vq), cập nhật `st` tại chỗ; trả PCM mono 48 kHz của nhóm đó. Cho kết quả khớp
    /// từng mẫu với `decode` trên toàn bộ khung (đã đối chiếu trong tests/engine_ref.rs).
    pub fn codec_stream_decode(&mut self, st: &mut CodecStream, frames: &[Vec<i64>]) -> Result<Vec<f32>> {
        let k = frames.len();
        let codes: Vec<i32> = frames.iter().flat_map(|f| f.iter().map(|&c| c as i32)).collect();
        let mut inputs: Vec<(String, DynValue)> = vec![
            ("audio_codes".into(), i32_tensor(&[1, k, self.cfg.n_vq], codes)?),
            ("audio_code_lengths".into(), i32_tensor(&[1], vec![k as i32])?),
        ];
        let old = std::mem::take(&mut st.state);
        let mut names = Vec::with_capacity(old.len());
        for (inp, outp, v) in old {
            names.push((inp.clone(), outp));
            inputs.push((inp, v));
        }
        let t_cd = std::time::Instant::now();
        let mut o = self.codec_step.run(inputs)?;
        self.prof.codec += t_cd.elapsed();
        for (inp, outp) in names {
            let v = o.remove(outp.as_str()).ok_or_else(|| format!("thiếu đầu ra {outp}"))?;
            st.state.push((inp, outp, v));
        }
        let (shape, data) = o["audio"].try_extract_tensor::<f32>()?;
        let (c, s) = (shape[1] as usize, shape[2] as usize);
        let valid = match o["audio_lengths"].try_extract_tensor::<i32>() {
            Ok((_, l)) => l[0] as usize,
            Err(_) => o["audio_lengths"].try_extract_tensor::<i64>()?.1[0] as usize,
        }
        .min(s);
        Ok((0..valid)
            .map(|i| (0..c).map(|ch| data[ch * s + i]).sum::<f32>() / c as f32)
            .collect())
    }

    /// Chữ đã thành âm vị → PCM 48 kHz.
    pub fn synthesize(
        &mut self,
        phonemes: &str,
        spk: &[f32],
        ref_codes: &[i64],
        p: &GenParams,
        rng: &mut Rng,
        cancelled: &dyn Fn() -> bool,
    ) -> Result<(Vec<f32>, usize)> {
        let anchor = self.speaker_anchor(spk)?;
        let (rows, _) = self.build_rows(phonemes, ref_codes)?;
        let prompt = self.embed_rows(&rows, &anchor);
        let frames = self.generate(prompt, &anchor, p, rng, cancelled)?;
        if frames.is_empty() {
            return Ok((Vec::new(), 0));
        }
        Ok((self.decode(&frames)?, frames.len()))
    }
}
