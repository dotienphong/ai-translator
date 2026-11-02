//! Giọng preset của v3 Turbo (`voices_v3_turbo.json`): mỗi giọng là x-vector 192 chiều cộng mã tham chiếu (T × n_vq).
//! Không dùng nhân bản giọng nên không cần bộ mã hóa người nói hay khử nhiễu.

use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct RawVoice {
    speaker_emb: Vec<f32>,
    codes: Vec<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
struct RawFile {
    #[serde(default)]
    default_voice: Option<String>,
    presets: HashMap<String, RawVoice>,
}

#[derive(Debug, Clone)]
pub struct Voice {
    pub name: String,
    pub speaker_emb: Vec<f32>,
    /// (T × n_vq) dàn phẳng.
    pub codes: Vec<i64>,
}

#[derive(Debug)]
pub struct Voices {
    default: String,
    by_name: HashMap<String, Voice>,
}

impl Voices {
    pub fn load(path: &Path, n_vq: usize) -> Result<Self, Box<dyn std::error::Error>> {
        Self::parse(&std::fs::read_to_string(path)?, n_vq)
    }

    pub fn parse(json: &str, n_vq: usize) -> Result<Self, Box<dyn std::error::Error>> {
        let raw: RawFile = serde_json::from_str(json)?;
        let mut by_name = HashMap::new();
        for (name, v) in raw.presets {
            if v.codes.iter().any(|r| r.len() != n_vq) || v.codes.is_empty() {
                return Err(format!("giọng {name}: mã tham chiếu sai kích thước").into());
            }
            by_name.insert(
                name.clone(),
                Voice {
                    name,
                    speaker_emb: v.speaker_emb,
                    codes: v.codes.into_iter().flatten().collect(),
                },
            );
        }
        let default = raw
            .default_voice
            .filter(|d| by_name.contains_key(d))
            .or_else(|| {
                let mut names: Vec<&String> = by_name.keys().collect();
                names.sort();
                names.first().map(|s| (*s).clone())
            })
            .ok_or("không có giọng nào")?;
        Ok(Self { default, by_name })
    }

    /// Giọng theo tên; `None` hoặc tên lạ thì dùng giọng mặc định.
    pub fn get(&self, name: Option<&str>) -> &Voice {
        name.and_then(|n| self.by_name.get(n))
            .unwrap_or_else(|| &self.by_name[&self.default])
    }

    pub fn names(&self) -> Vec<&str> {
        let mut v: Vec<&str> = self.by_name.keys().map(String::as_str).collect();
        v.sort_unstable();
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const J: &str = r#"{"default_voice":"B","presets":{"A":{"speaker_emb":[1,2],"codes":[[1,2],[3,4]]},"B":{"speaker_emb":[3],"codes":[[5,6]]}}}"#;

    #[test]
    fn loads_and_falls_back_to_default() {
        let v = Voices::parse(J, 2).unwrap();
        assert_eq!(v.get(None).name, "B");
        assert_eq!(v.get(Some("A")).codes, vec![1, 2, 3, 4]);
        assert_eq!(v.get(Some("không có")).name, "B");
        assert_eq!(v.names(), ["A", "B"]);
    }

    #[test]
    fn rejects_bad_shape_and_empty() {
        assert!(Voices::parse(J, 3).is_err());
        assert!(Voices::parse(r#"{"presets":{}}"#, 2).is_err());
    }
}
