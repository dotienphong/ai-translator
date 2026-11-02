//! `config.json` của v3 Turbo (chỉ các trường pipeline cần).

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub n_vq: usize,
    pub hidden_size: usize,
    pub num_hidden_layers: usize,
    #[serde(default = "one")]
    pub local_num_hidden_layers: usize,
    #[serde(default = "eight")]
    pub local_num_attention_heads: usize,
    pub audio_pad_token_id: i64,
    pub text_prompt_start_token_id: i64,
    pub text_prompt_end_token_id: i64,
    pub speech_generation_start_token_id: i64,
    pub speech_generation_end_token_id: i64,
    pub audio_ref_slot_token_id: i64,
    #[serde(default = "sixteen")]
    pub default_style_token_id: i64,
    #[serde(default)]
    pub use_speaker_embedding: bool,
    #[serde(default = "d192")]
    pub speaker_embedding_dim: usize,
    pub text_vocab_size: usize,
    pub audio_vocab_size: usize,
}

fn one() -> usize {
    1
}
fn eight() -> usize {
    8
}
fn sixteen() -> i64 {
    16
}
fn d192() -> usize {
    192
}

impl Config {
    pub fn parse(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}
