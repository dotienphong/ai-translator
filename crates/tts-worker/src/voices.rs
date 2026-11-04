//! Giọng preset của v3 Turbo (`voices_v3_turbo.json`): mỗi giọng là x-vector 192 chiều cộng mã tham chiếu (T × n_vq).
//! Không dùng nhân bản giọng nên không cần bộ mã hóa người nói hay khử nhiễu.

use serde::Deserialize;
use serde::de::IgnoredAny;
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

/// Chỉ đọc tên giọng và tên mặc định, không giải mã vector hay mã tham chiếu (cho `ListVoices`, không nạp model).
/// Mặc định theo đúng quy tắc của [`Voices::parse`]: `default_voice` nếu có trong danh sách, không thì tên đầu theo thứ tự chữ.
pub fn list_names(path: &Path) -> Result<(Vec<String>, String), Box<dyn std::error::Error>> {
    #[derive(Deserialize)]
    struct NamesOnly {
        #[serde(default)]
        default_voice: Option<String>,
        presets: HashMap<String, IgnoredAny>,
    }
    let raw: NamesOnly = serde_json::from_str(&std::fs::read_to_string(path)?)?;
    let mut names: Vec<String> = raw.presets.into_keys().collect();
    names.sort_unstable();
    let default = raw
        .default_voice
        .filter(|d| names.contains(d))
        .or_else(|| names.first().cloned())
        .ok_or("không có giọng nào")?;
    Ok((names, default))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Ghi `json` ra file tạm riêng cho từng test rồi gọi `list_names`.
    fn list_json(tag: &str, json: &str) -> Result<(Vec<String>, String), Box<dyn std::error::Error>> {
        let path = std::env::temp_dir().join(format!("tts-worker-voices-{tag}-{}.json", std::process::id()));
        std::fs::write(&path, json).unwrap();
        let r = list_names(&path);
        let _ = std::fs::remove_file(&path);
        r
    }

    #[test]
    fn list_names_sorted_with_default() {
        let j = r#"{"default_voice":"Hải Đăng","presets":{
            "Ngọc Lan":{"speaker_emb":[1],"codes":[[1,2]]},
            "Hải Đăng":{"speaker_emb":[2],"codes":[[3,4]]},
            "An":{"speaker_emb":[3],"codes":[[5,6]],"thừa":true}}}"#;
        let (names, default) = list_json("sorted", j).unwrap();
        assert_eq!(names, ["An", "Hải Đăng", "Ngọc Lan"]);
        assert_eq!(default, "Hải Đăng");
        // Cùng quy tắc với `Voices::parse`.
        assert_eq!(Voices::parse(j, 2).unwrap().get(None).name, default);
    }

    #[test]
    fn list_names_falls_back_to_first_name_when_default_missing() {
        let j = r#"{"default_voice":"Không có","presets":{"B":{"speaker_emb":[1],"codes":[[1]]},"A":{"speaker_emb":[1],"codes":[[1]]}}}"#;
        assert_eq!(
            list_json("missing", j).unwrap(),
            (vec!["A".into(), "B".into()], "A".into())
        );
        let j = r#"{"presets":{"B":{"speaker_emb":[1],"codes":[[1]]},"A":{"speaker_emb":[1],"codes":[[1]]}}}"#;
        assert_eq!(list_json("absent", j).unwrap().1, "A");
    }

    #[test]
    fn list_names_rejects_empty_presets() {
        assert!(list_json("empty", r#"{"default_voice":"A","presets":{}}"#).is_err());
        assert!(list_json("broken", "{không phải json").is_err());
        assert!(list_names(Path::new("/không/có/file/này.json")).is_err());
    }

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
