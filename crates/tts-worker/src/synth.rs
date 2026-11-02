//! Ghép chữ → câu → âm vị → mã → PCM, có trần số khung, chống "nói thêm" và khoảng nghỉ giữa câu.
//! Port logic của `V3TurboVieNeuTTS` (SDK `vieneu`) cho đường ONNX, chỉ phần cần cho câu phụ đề ngắn.

use crate::engine::{Cancelled, Engine, GenParams, Profile, Result};
use crate::frames::{is_cue_only, max_expected_frames, syllable_count};
use crate::phonemize::Phonemizer;
use crate::sampling::Rng;
use crate::speech::{
    BABBLE_MAX_RETRIES, BABBLE_MAX_SYLLABLES, Babble, GAP_MINOR_S, GAP_SENTENCE_S, babble_prefer, babble_suspect,
    pause_pad_samples,
};
use crate::text::{split_into_sentences, split_long};
use crate::voices::Voices;

pub const SAMPLE_RATE: u32 = 48_000;
/// Câu dài hơn chừng này ký tự thì cắt ở dấu phụ để mỗi lượt sinh vừa phải.
pub const MAX_UNIT_CHARS: usize = 220;

pub struct Synth {
    /// Phát dần theo khung (độ trễ đầu thấp). Đoạn ngắn ≤ 3 tiếng luôn đi đường không phát dần để còn chống "nói thêm".
    pub stream: bool,
    pub engine: Engine,
    pub phonemizer: Phonemizer,
    pub voices: Voices,
    pub params: GenParams,
    pub babble_retries: usize,
    rng: Rng,
}

/// Số liệu của một lần đọc (không chứa chữ của người dùng).
#[derive(Debug, Default, Clone, Copy)]
pub struct SpeakStats {
    pub units: usize,
    pub frames: usize,
    pub retries: usize,
    pub gen_ms: u128,
    pub first_audio_ms: u128,
    pub audio_samples: usize,
    /// Thời gian từng khâu của engine trong lần đọc này.
    pub prof: Profile,
}

impl Synth {
    pub fn new(engine: Engine, phonemizer: Phonemizer, voices: Voices, seed: u64) -> Self {
        Self {
            stream: true,
            engine,
            phonemizer,
            voices,
            params: GenParams::default(),
            babble_retries: BABBLE_MAX_RETRIES,
            rng: Rng::new(seed),
        }
    }

    /// Đọc `text`; mỗi đoạn PCM (kể cả khoảng lặng) đi qua `emit` ngay khi có. `cancelled` được hỏi giữa các khung.
    pub fn speak(
        &mut self,
        text: &str,
        voice: Option<&str>,
        cancelled: &dyn Fn() -> bool,
        emit: &mut dyn FnMut(&[f32]) -> Result<()>,
    ) -> Result<SpeakStats> {
        let t0 = std::time::Instant::now();
        let voice = self.voices.get(voice).clone();
        let mut stats = SpeakStats::default();
        let units: Vec<String> = split_into_sentences(text)
            .iter()
            .flat_map(|s| split_long(s, MAX_UNIT_CHARS))
            .collect();
        let mut prev: Option<(Vec<f32>, String)> = None;
        for unit in &units {
            let ph = self.phonemizer.phonemize(unit);
            if ph.trim().is_empty() {
                continue;
            }
            let gap = |t: &str| {
                if t.trim_end().ends_with(['.', '!', '?']) {
                    GAP_SENTENCE_S
                } else {
                    GAP_MINOR_S
                }
            };
            let streamable = self.stream && !is_cue_only(&ph) && syllable_count(&ph) > BABBLE_MAX_SYLLABLES;
            let wav = if streamable {
                // Phát dần từng nhóm khung; khoảng nghỉ đầu đoạn tính từ nhóm đầu tiên.
                let (wav, frames) =
                    self.stream_unit(&ph, &voice.speaker_emb, &voice.codes, cancelled, |chunk, first| {
                        if first && let Some((prev_wav, prev_text)) = &prev {
                            let pad = pause_pad_samples(prev_wav, chunk, SAMPLE_RATE, gap(prev_text));
                            if pad > 0 {
                                emit(&vec![0.0f32; pad])?;
                                stats.audio_samples += pad;
                            }
                        }
                        if stats.first_audio_ms == 0 {
                            stats.first_audio_ms = t0.elapsed().as_millis();
                        }
                        stats.audio_samples += chunk.len();
                        emit(chunk)
                    })?;
                stats.units += 1;
                stats.frames += frames;
                wav
            } else {
                let (wav, frames, retries) = self.gen_unit(&ph, &voice.speaker_emb, &voice.codes, cancelled)?;
                stats.units += 1;
                stats.frames += frames;
                stats.retries += retries;
                if wav.is_empty() {
                    continue;
                }
                if let Some((prev_wav, prev_text)) = &prev {
                    let pad = pause_pad_samples(prev_wav, &wav, SAMPLE_RATE, gap(prev_text));
                    if pad > 0 {
                        emit(&vec![0.0f32; pad])?;
                        stats.audio_samples += pad;
                    }
                }
                if stats.first_audio_ms == 0 {
                    stats.first_audio_ms = t0.elapsed().as_millis();
                }
                stats.audio_samples += wav.len();
                emit(&wav)?;
                wav
            };
            if wav.is_empty() {
                continue;
            }
            prev = Some((wav, unit.clone()));
        }
        stats.gen_ms = t0.elapsed().as_millis();
        stats.prof = self.engine.take_profile();
        Ok(stats)
    }

    /// Sinh và giải mã dần một đoạn: gọi `on_chunk(pcm, là_nhóm_đầu)` ngay khi có từng nhóm khung. Trả toàn bộ PCM (để tính khoảng
    /// nghỉ với đoạn sau) và số khung. Cỡ nhóm theo độ dài âm thanh đã đệm sẵn (như SDK): ít khung khi sắp hết hơi để giữ độ trễ
    /// thấp, nhiều khung khi đã đệm đủ để giảm chi phí mỗi lượt.
    fn stream_unit(
        &mut self,
        ph: &str,
        spk: &[f32],
        ref_codes: &[i64],
        cancelled: &dyn Fn() -> bool,
        mut on_chunk: impl FnMut(&[f32], bool) -> Result<()>,
    ) -> Result<(Vec<f32>, usize)> {
        const LEADIN_FRAMES: usize = 4;
        const CHUNK_FRAMES: usize = 25;
        let mut p = self.params;
        p.max_new_frames = p.max_new_frames.min(max_expected_frames(ph));
        let (prompt, anchor) = self.engine.prepare(ph, spk, ref_codes)?;
        let mut st = self.engine.begin(prompt, &anchor, &p)?;
        let mut cs = self.engine.codec_stream_new()?;
        let (mut buffer, mut all, mut emitted): (Vec<Vec<i64>>, Vec<f32>, usize) = (Vec::new(), Vec::new(), 0);
        let (mut t_first, mut first, mut n_frames) = (None::<std::time::Instant>, true, 0usize);
        for _ in 0..p.max_new_frames {
            if cancelled() {
                return Err(Box::new(Cancelled));
            }
            let (codes, eos) = self.engine.next_frame(&mut st, &p, &mut self.rng)?;
            n_frames += 1;
            buffer.push(codes);
            let target = match t_first {
                None => LEADIN_FRAMES,
                Some(t) => {
                    let lead = emitted as f32 / SAMPLE_RATE as f32 - t.elapsed().as_secs_f32();
                    if lead < 0.20 {
                        LEADIN_FRAMES
                    } else if lead < 0.55 {
                        6
                    } else if lead < 1.10 {
                        8
                    } else {
                        CHUNK_FRAMES
                    }
                }
            };
            if buffer.len() >= target || eos {
                let chunk = self.engine.codec_stream_decode(&mut cs, &buffer)?;
                buffer.clear();
                if !chunk.is_empty() {
                    t_first.get_or_insert_with(std::time::Instant::now);
                    emitted += chunk.len();
                    on_chunk(&chunk, first)?;
                    first = false;
                    all.extend_from_slice(&chunk);
                }
            }
            if eos {
                break;
            }
        }
        if !buffer.is_empty() {
            let chunk = self.engine.codec_stream_decode(&mut cs, &buffer)?;
            if !chunk.is_empty() {
                on_chunk(&chunk, first)?;
                all.extend_from_slice(&chunk);
            }
        }
        Ok((all, n_frames))
    }

    /// Một đoạn âm vị → (PCM, số khung, số lần sinh lại). Sinh lại tối đa `babble_retries` lần khi nghi "nói thêm".
    fn gen_unit(
        &mut self,
        ph: &str,
        spk: &[f32],
        ref_codes: &[i64],
        cancelled: &dyn Fn() -> bool,
    ) -> Result<(Vec<f32>, usize, usize)> {
        let cap = max_expected_frames(ph);
        let mut p = self.params;
        p.max_new_frames = p.max_new_frames.min(cap);
        let (mut wav, mut n) = self
            .engine
            .synthesize(ph, spk, ref_codes, &p, &mut self.rng, cancelled)?;
        if wav.is_empty() {
            return Ok((wav, 0, 0));
        }
        let mut best: Babble = babble_suspect(&wav, SAMPLE_RATE, ph, p.max_new_frames, Some(n));
        let mut tries = 0;
        while best.suspect && tries < self.babble_retries {
            tries += 1;
            if cancelled() {
                return Err(Box::new(Cancelled));
            }
            let (w2, n2) = self
                .engine
                .synthesize(ph, spk, ref_codes, &p, &mut self.rng, cancelled)?;
            if w2.is_empty() {
                continue;
            }
            let cand = babble_suspect(&w2, SAMPLE_RATE, ph, p.max_new_frames, Some(n2));
            if babble_prefer(&cand, &best) {
                wav = w2;
                n = n2;
                best = cand;
            }
        }
        Ok((wav, n, tries))
    }
}

/// PCM f32 → i16 có kẹp biên.
pub fn to_i16(pcm: &[f32]) -> Vec<i16> {
    pcm.iter()
        .map(|&x| (x.clamp(-1.0, 1.0) * 32767.0).round() as i16)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::to_i16;

    #[test]
    fn i16_conversion_clamps() {
        assert_eq!(
            to_i16(&[0.0, 1.0, -1.0, 2.0, -2.0, 0.5]),
            [0, 32767, -32767, 32767, -32767, 16384]
        );
    }
}
