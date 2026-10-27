//! Phần thân của manifest model `models.json` (spec §6.7; Đ7 của kế hoạch 00): file model, gói, ngưỡng đề xuất gói theo
//! máy, và ngưỡng của pipeline muốn đổi. File trên R2 là một phong bì ký Ed25519 ([`super::signed`]); file này chỉ đọc
//! phần thân sau khi chữ ký đã đúng.
//!
//! - Mỗi file có các trường của §6.7: `id`, `tier` (danh sách gói có file này: VAD và giấy phép dùng chung), `kind`
//!   (`asr`, `mt`, `vad`, và `license` cho LICENSE, NOTICE đặt cạnh model), `version`, `url`, `bytes`, `sha256`,
//!   `license_id`, `min_app_version`; thêm `file` là tên file trên máy, và `prompt` (chỉ file `mt`, tùy chọn) là họ mẫu
//!   prompt của model dịch (spec 2026-10-21-goi-nhanh §4.2).
//! - Gói (`packs`) có tên và ghi chú chất lượng theo hai ngôn ngữ giao diện (§8), vì gói mới (ví dụ gói lai, Q15) thêm
//!   bằng manifest, không phát hành lại app. Mỗi gói có đúng một file `asr`, một `mt`, một `vad`.
//! - `recommend`: RAM tối thiểu và luật đề xuất gói, xét theo thứ tự, luật đầu tiên khớp thắng; không luật nào khớp thì
//!   dùng `fallback` (§8, Đ7).
//! - `pipeline`: các ngưỡng của `PipelineConfig` muốn đổi (02a QĐ21). Sai thì giữ mặc định, manifest vẫn dùng được.
//! - `speaker`, `speaker_config` (spec 2026-10-26-phan-biet-nguoi-noi §4.5): model nhúng giọng ở khóa gốc (một mục file, không
//!   thuộc gói nào; app ≤ 0.3.1 bỏ qua khóa lạ ở gốc, còn `kind` lạ trong `files` làm nó từ chối cả manifest) và ngưỡng của nhận
//!   giọng. Đọc lỏng: mục sai, hay cần app mới hơn, thì chỉ mất phần nhận giọng ([`Manifest::speaker_model`],
//!   [`Manifest::speaker_config`]).
//!
//! Khóa lạ trong phần thân bị bỏ qua (manifest mới hơn app); khóa thiếu là lỗi.

use pipeline::config::PipelineConfig;
use pipeline::prompt::PromptFamily;
use serde::{Deserialize, Serialize};
use speaker_protocol::SpeakerConfig;

/// Phiên bản định dạng phần thân mà app này đọc được.
pub const SCHEMA: u32 = 1;
/// Bản app đầu tiên hiểu trường `prompt` (spec gói Nhanh §4.2): file `mt` có họ khác `hy-mt2` phải đặt
/// `min_app_version` từ bản này, vì app cũ bỏ qua `prompt` và sẽ dùng mẫu Hy-MT2.
pub const PROMPT_FIELD_SINCE: &str = "0.2.0";
/// Một file model không lớn hơn chừng này (Q8_0 là 1,91 GB).
pub const MAX_FILE_BYTES: u64 = 16 << 30;
const MAX_TEXT: usize = 500;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Asr,
    Mt,
    Vad,
    License,
    /// Model nhúng giọng (khóa gốc `speaker`). Chỉ dùng trong app; không bao giờ đọc từ `files` (`skip`), để manifest có `kind`
    /// này trong `files` vẫn bị từ chối như với app cũ (test `an_unknown_kind_in_files_breaks_this_app`).
    #[serde(skip)]
    Speaker,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileEntry {
    pub id: String,
    /// Các gói có file này.
    pub tier: Vec<String>,
    pub kind: Kind,
    pub version: String,
    /// Tên file trong thư mục model.
    pub file: String,
    /// Đường dẫn tương đối so với URL của manifest, hoặc URL `https://` đầy đủ.
    pub url: String,
    pub bytes: u64,
    /// SHA-256 dạng hex chữ thường.
    pub sha256: String,
    pub license_id: String,
    pub min_app_version: String,
    /// Họ mẫu prompt của file `mt` (`hy-mt2`, `lmt`); bỏ trống là `hy-mt2`. Giá trị lạ thì gói không dùng được.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
}

impl FileEntry {
    /// Họ prompt mà app này hiểu; `None` khi giá trị lạ (họ của app mới hơn).
    pub fn prompt_family(&self) -> Option<PromptFamily> {
        match &self.prompt {
            None => Some(PromptFamily::HyMt2),
            Some(code) => PromptFamily::from_code(code),
        }
    }
}

/// Chữ theo ngôn ngữ giao diện (§4.5).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Localized {
    pub vi: String,
    pub en: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pack {
    pub id: String,
    pub name: Localized,
    /// Ghi chú chất lượng khi chọn gói (§8).
    pub note: Localized,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Os {
    Macos,
    Windows,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GpuKind {
    /// Card rời (`VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU`). GPU tích hợp chưa được tính (§6.7).
    Discrete,
}

/// Một luật đề xuất gói. Điều kiện bỏ trống thì không xét.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rule {
    pub pack: String,
    #[serde(default)]
    pub os: Option<Os>,
    #[serde(default)]
    pub min_ram_mib: Option<u64>,
    #[serde(default)]
    pub gpu: Option<GpuKind>,
    /// Heap `DEVICE_LOCAL` lớn nhất của card (theo `--probe`), tính bằng MiB.
    #[serde(default)]
    pub min_vram_mib: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Recommend {
    /// Máy có ít RAM hơn thì chưa được hỗ trợ (§8).
    pub min_ram_mib: u64,
    pub rules: Vec<Rule>,
    pub fallback: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Manifest {
    pub schema: u32,
    /// Tăng mỗi lần phát hành manifest; app không nhận manifest có số nhỏ hơn bản đã nhận (chống quay lui).
    pub sequence: u64,
    pub published_at: String,
    pub files: Vec<FileEntry>,
    pub packs: Vec<Pack>,
    pub recommend: Recommend,
    #[serde(default)]
    pub pipeline: Option<serde_json::Value>,
    /// Mục model nhúng giọng, thô; đọc qua [`Manifest::speaker_model`].
    #[serde(default)]
    pub speaker: Option<serde_json::Value>,
    /// Ngưỡng của nhận giọng, thô; đọc qua [`Manifest::speaker_config`].
    #[serde(default)]
    pub speaker_config: Option<serde_json::Value>,
}

/// Trường đầu tiên không hợp lệ, dạng `files[2].sha256`.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
#[error("manifest: `{0}` không hợp lệ")]
pub struct Invalid(pub String);

/// Phiên bản `x.y.z` (bỏ phần sau dấu `-` hay `+`).
pub fn version(text: &str) -> Option<(u64, u64, u64)> {
    let core = text.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    let mut next = || parts.next()?.parse::<u64>().ok();
    let v = (next()?, next()?, next()?);
    parts.next().is_none().then_some(v)
}

/// Mã gói hay mã file: chữ thường, số, `.`, `_`, `-`; bắt đầu bằng chữ hoặc số.
pub fn is_id(text: &str, max: usize) -> bool {
    let mut chars = text.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && text.len() <= max
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'))
}

/// Tên file của chính kho model (`store.rs`): manifest không được ghi đè chúng.
pub const STORE_FILES: [&str; 3] = ["manifest.json", "installed.json", "state.json"];
/// Tên thiết bị của Windows: `CON`, `NUL.bin`… không phải file thường.
const WINDOWS_DEVICES: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2",
    "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// Tên file an toàn trong thư mục model: không có thư mục con, không bắt đầu bằng `.`, không kết thúc bằng `.`, không
/// đuôi `.part` hay `.tmp` (file tạm của kho), không trùng file của kho, không phải tên thiết bị của Windows.
pub fn is_safe_file_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    let stem = lower.split('.').next().unwrap_or_default();
    let mut chars = name.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphanumeric())
        && name.len() <= 128
        && !name.ends_with('.')
        && !lower.ends_with(".part")
        && !lower.ends_with(".tmp")
        && !STORE_FILES.contains(&lower.as_str())
        && !WINDOWS_DEVICES.contains(&stem)
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn is_sha256(text: &str) -> bool {
    text.len() == 64 && text.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

/// URL tương đối (các đoạn an toàn, không `.` hay `..`), hoặc `https://` đầy đủ.
fn is_model_url(url: &str) -> bool {
    if url.contains("://") {
        return url.starts_with("https://") && reqwest::Url::parse(url).is_ok();
    }
    !url.is_empty()
        && url.len() <= 512
        && url.split('/').all(|seg| {
            !seg.is_empty()
                && seg != "."
                && seg != ".."
                && seg
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        })
}

fn is_text(text: &str) -> bool {
    !text.trim().is_empty() && text.chars().count() <= MAX_TEXT
}

/// Model nhúng giọng không lớn hơn chừng này (ERes2Net sau onnxsim: 26,5 MB).
pub const MAX_SPEAKER_BYTES: u64 = 200 << 20;

/// Mục `speaker` của manifest (spec 2026-10-26-phan-biet-nguoi-noi §4.5).
#[derive(Deserialize)]
struct SpeakerEntry {
    id: String,
    version: String,
    file: String,
    url: String,
    bytes: u64,
    sha256: String,
    license_id: String,
    min_app_version: String,
}

impl Manifest {
    /// Đọc và kiểm phần thân (đã kiểm chữ ký).
    pub fn parse(body: &[u8]) -> Result<Self, Invalid> {
        let manifest: Manifest = serde_json::from_slice(body).map_err(|e| Invalid(format!("json: {e}")))?;
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn validate(&self) -> Result<(), Invalid> {
        let bad = |field: String| Err(Invalid(field));
        if self.schema != SCHEMA {
            return bad("schema".into());
        }
        if self.packs.is_empty() {
            return bad("packs".into());
        }
        for (i, pack) in self.packs.iter().enumerate() {
            if !is_id(&pack.id, 32) || self.packs[..i].iter().any(|p| p.id == pack.id) {
                return bad(format!("packs[{i}].id"));
            }
            for (field, text) in [
                ("name.vi", &pack.name.vi),
                ("name.en", &pack.name.en),
                ("note.vi", &pack.note.vi),
                ("note.en", &pack.note.en),
            ] {
                if !is_text(text) {
                    return bad(format!("packs[{i}].{field}"));
                }
            }
        }
        if self.files.is_empty() {
            return bad("files".into());
        }
        for (i, f) in self.files.iter().enumerate() {
            let at = |field: &str| format!("files[{i}].{field}");
            let earlier = &self.files[..i];
            if !is_id(&f.id, 64) || earlier.iter().any(|e| e.id == f.id) {
                return bad(at("id"));
            }
            if f.tier.is_empty() || f.tier.iter().any(|t| self.pack(t).is_none()) {
                return bad(at("tier"));
            }
            if f.version.is_empty() || f.version.len() > 32 {
                return bad(at("version"));
            }
            // So không phân biệt hoa thường: APFS và NTFS mặc định coi hai tên đó là một file.
            if !is_safe_file_name(&f.file) || earlier.iter().any(|e| e.file.eq_ignore_ascii_case(&f.file)) {
                return bad(at("file"));
            }
            if !is_model_url(&f.url) {
                return bad(at("url"));
            }
            if f.bytes == 0 || f.bytes > MAX_FILE_BYTES {
                return bad(at("bytes"));
            }
            if !is_sha256(&f.sha256) {
                return bad(at("sha256"));
            }
            if f.license_id.trim().is_empty() || f.license_id.len() > 64 {
                return bad(at("license_id"));
            }
            if version(&f.min_app_version).is_none() {
                return bad(at("min_app_version"));
            }
            if f.prompt.as_ref().is_some_and(|p| f.kind != Kind::Mt || !is_id(p, 32)) {
                return bad(at("prompt"));
            }
        }
        for (i, pack) in self.packs.iter().enumerate() {
            for kind in [Kind::Asr, Kind::Mt, Kind::Vad] {
                if self.files_of(&pack.id).iter().filter(|f| f.kind == kind).count() != 1 {
                    return bad(format!("packs[{i}].files"));
                }
            }
        }
        let r = &self.recommend;
        if r.min_ram_mib == 0 {
            return bad("recommend.min_ram_mib".into());
        }
        for (i, rule) in r.rules.iter().enumerate() {
            if self.pack(&rule.pack).is_none() {
                return bad(format!("recommend.rules[{i}].pack"));
            }
            if rule.min_vram_mib.is_some() && rule.gpu.is_none() {
                return bad(format!("recommend.rules[{i}].gpu"));
            }
        }
        if self.pack(&r.fallback).is_none() {
            return bad("recommend.fallback".into());
        }
        Ok(())
    }

    pub fn pack(&self, id: &str) -> Option<&Pack> {
        self.packs.iter().find(|p| p.id == id)
    }

    /// Các file của một gói, theo thứ tự trong manifest.
    pub fn files_of(&self, pack: &str) -> Vec<&FileEntry> {
        self.files.iter().filter(|f| f.tier.iter().any(|t| t == pack)).collect()
    }

    pub fn pack_bytes(&self, pack: &str) -> u64 {
        self.files_of(pack).iter().map(|f| f.bytes).sum()
    }

    /// Mọi file của gói đều chạy được với app bản `app_version` (`min_app_version`), và app hiểu họ prompt của file
    /// `mt` (họ lạ: gói của app mới hơn, spec gói Nhanh §4.2).
    pub fn usable_by(&self, pack: &str, app_version: &str) -> bool {
        let Some(app) = version(app_version) else {
            return false;
        };
        let files = self.files_of(pack);
        !files.is_empty()
            && files
                .iter()
                .all(|f| version(&f.min_app_version).is_some_and(|min| min <= app) && f.prompt_family().is_some())
    }

    /// File `mt` có họ prompt khác `hy-mt2` mà `min_app_version` thấp hơn [`PROMPT_FIELD_SINCE`]: app cũ sẽ dùng nhầm mẫu
    /// Hy-MT2. `check_manifest_body` chặn trước khi ký.
    pub fn prompt_needs_newer_app(&self) -> Vec<String> {
        let since = version(PROMPT_FIELD_SINCE).expect("hằng hợp lệ");
        self.files
            .iter()
            .enumerate()
            .filter_map(|(i, f)| {
                let family = f.prompt.as_deref().filter(|p| *p != "hy-mt2")?;
                version(&f.min_app_version)
                    .is_none_or(|v| v < since)
                    .then(|| format!("files[{i}]: {family} cần min_app_version >= {PROMPT_FIELD_SINCE}"))
            })
            .collect()
    }

    /// Ngưỡng của pipeline: mặc định, đè bằng phần `pipeline` của manifest nếu đọc được và hợp lệ.
    pub fn pipeline_config(&self) -> PipelineConfig {
        let Some(value) = &self.pipeline else {
            return PipelineConfig::default();
        };
        match serde_json::from_value::<PipelineConfig>(value.clone()) {
            Ok(config) => match config.validate() {
                Ok(()) => config,
                Err(field) => {
                    log::warn!("manifest: ngưỡng pipeline `{field}` vô lý, dùng mặc định");
                    PipelineConfig::default()
                }
            },
            Err(e) => {
                log::warn!("manifest: không đọc được phần pipeline ({e}), dùng mặc định");
                PipelineConfig::default()
            }
        }
    }

    /// Model nhúng giọng cho app bản `app_version`, dạng `FileEntry` (`kind` `Speaker`, không thuộc gói nào) để kho tải và kiểm
    /// như file khác. `None` khi không có khóa, mục sai (ghi log), hay cần app mới hơn.
    pub fn speaker_model(&self, app_version: &str) -> Option<FileEntry> {
        let value = self.speaker.as_ref()?;
        let entry = match self.speaker_entry(value) {
            Ok(entry) => entry,
            Err(field) => {
                log::warn!("manifest: mục `speaker.{field}` không hợp lệ, bỏ qua nhận giọng");
                return None;
            }
        };
        (version(&entry.min_app_version)? <= version(app_version)?).then_some(entry)
    }

    fn speaker_entry(&self, value: &serde_json::Value) -> Result<FileEntry, String> {
        let e: SpeakerEntry = serde_json::from_value(value.clone()).map_err(|_| "json".to_string())?;
        let checks = [
            ("id", is_id(&e.id, 64) && !self.files.iter().any(|f| f.id == e.id)),
            ("version", !e.version.is_empty() && e.version.len() <= 32),
            (
                "file",
                is_safe_file_name(&e.file) && !self.files.iter().any(|f| f.file.eq_ignore_ascii_case(&e.file)),
            ),
            ("url", is_model_url(&e.url)),
            ("bytes", e.bytes > 0 && e.bytes <= MAX_SPEAKER_BYTES),
            ("sha256", is_sha256(&e.sha256)),
            (
                "license_id",
                !e.license_id.trim().is_empty() && e.license_id.len() <= 64,
            ),
            ("min_app_version", version(&e.min_app_version).is_some()),
        ];
        if let Some((field, _)) = checks.iter().find(|(_, ok)| !ok) {
            return Err((*field).to_string());
        }
        Ok(FileEntry {
            id: e.id,
            tier: Vec::new(),
            kind: Kind::Speaker,
            version: e.version,
            file: e.file,
            url: e.url,
            bytes: e.bytes,
            sha256: e.sha256,
            license_id: e.license_id,
            min_app_version: e.min_app_version,
            prompt: None,
        })
    }

    /// Ngưỡng của nhận giọng: mặc định, đè bằng `speaker_config` nếu đọc được và hợp lệ (`SpeakerConfig::validate`, cùng luật
    /// worker dùng).
    pub fn speaker_config(&self) -> SpeakerConfig {
        let Some(value) = &self.speaker_config else {
            return SpeakerConfig::default();
        };
        match serde_json::from_value::<SpeakerConfig>(value.clone()) {
            Ok(config) => match config.validate() {
                Ok(()) => config,
                Err(field) => {
                    log::warn!("manifest: ngưỡng nhận giọng `{field}` vô lý, dùng mặc định");
                    SpeakerConfig::default()
                }
            },
            Err(e) => {
                log::warn!("manifest: không đọc được speaker_config ({e}), dùng mặc định");
                SpeakerConfig::default()
            }
        }
    }
}

/// File model (`asr`, `mt`, `vad`) của một gói đổi `id` giữa hai bản manifest. Kho tìm file đã tải theo `id`, nên đổi
/// `id` làm gói đang dùng thành "chưa tải" ngay khi máy nhận bản mới, và không có lời mời cập nhật (N-8 của review 04
/// lần 2). Luật cho người soạn manifest: giữ `id` ổn định giữa các bản, chỉ đổi `version`, `file`, `bytes`, `sha256`.
/// Trả mô tả từng chỗ đổi; `check_manifest_body` chạy hàm này trước khi ký.
pub fn renamed_ids(old: &Manifest, new: &Manifest) -> Vec<String> {
    let id = |m: &Manifest, pack: &str, kind: Kind| {
        m.files_of(pack)
            .into_iter()
            .find(|f| f.kind == kind)
            .map(|f| f.id.clone())
    };
    let mut out = Vec::new();
    for pack in &new.packs {
        for kind in [Kind::Asr, Kind::Mt, Kind::Vad] {
            if let (Some(a), Some(b)) = (id(old, &pack.id, kind), id(new, &pack.id, kind))
                && a != b
            {
                out.push(format!("{} {kind:?}: {a} -> {b}", pack.id));
            }
        }
    }
    out
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::{Value, json};

    /// Manifest mẫu hợp lệ: hai gói, VAD và giấy phép dùng chung. Test của module khác dùng lại.
    pub(crate) fn sample() -> Value {
        let file = |id: &str, tier: &[&str], kind: &str, name: &str, bytes: u64| {
            json!({
                "id": id, "tier": tier, "kind": kind, "version": "1", "file": name,
                "url": format!("files/{name}"), "bytes": bytes, "sha256": "ab".repeat(32),
                "license_id": "MIT", "min_app_version": "0.1.0"
            })
        };
        json!({
            "schema": 1,
            "sequence": 3,
            "published_at": "2026-10-02T00:00:00Z",
            "files": [
                file("whisper-turbo", &["standard"], "asr", "ggml-large-v3-turbo-q5_0.bin", 500),
                file("whisper-small", &["lite"], "asr", "ggml-small-q5_1.bin", 200),
                file("hy-mt2-q8", &["standard"], "mt", "Hy-MT2-1.8B-Q8_0.gguf", 1900),
                file("hy-mt2-q4", &["lite"], "mt", "Hy-MT2-1.8B-Q4_K_M.gguf", 1100),
                file("silero-vad", &["standard", "lite"], "vad", "silero_vad_v6.2.3.onnx", 20),
                file("hy-mt2-license", &["standard", "lite"], "license", "Hy-MT2-LICENSE.txt", 10),
            ],
            "packs": [
                { "id": "standard", "name": { "vi": "Chuẩn", "en": "Standard" },
                  "note": { "vi": "Chép lời tốt nhất.", "en": "Best transcription." } },
                { "id": "lite", "name": { "vi": "Nhẹ", "en": "Lite" },
                  "note": { "vi": "Kém hơn với tiếng Việt.", "en": "Weaker for Vietnamese." } }
            ],
            "recommend": {
                "min_ram_mib": 7000,
                "rules": [
                    { "pack": "standard", "os": "macos", "min_ram_mib": 15000 },
                    { "pack": "standard", "os": "windows", "min_ram_mib": 15000,
                      "gpu": "discrete", "min_vram_mib": 5600 }
                ],
                "fallback": "lite"
            }
        })
    }

    fn parse(value: &Value) -> Result<Manifest, Invalid> {
        Manifest::parse(&serde_json::to_vec(value).unwrap())
    }

    fn rejects(change: impl FnOnce(&mut Value), field: &str) {
        let mut value = sample();
        change(&mut value);
        assert_eq!(parse(&value).map(|_| ()), Err(Invalid(field.into())), "{field}");
    }

    #[test]
    fn the_sample_lists_the_files_of_each_pack() {
        let m = parse(&sample()).unwrap();
        let ids = |pack: &str| m.files_of(pack).iter().map(|f| f.id.clone()).collect::<Vec<_>>();
        assert_eq!(
            ids("standard"),
            ["whisper-turbo", "hy-mt2-q8", "silero-vad", "hy-mt2-license"]
        );
        assert_eq!(
            ids("lite"),
            ["whisper-small", "hy-mt2-q4", "silero-vad", "hy-mt2-license"]
        );
        assert_eq!(m.pack_bytes("standard"), 500 + 1900 + 20 + 10);
        assert_eq!(m.pack("lite").unwrap().name.vi, "Nhẹ");
        assert!(m.pack("hybrid").is_none());
    }

    #[test]
    fn unknown_keys_are_ignored_and_missing_keys_rejected() {
        let mut value = sample();
        value["future"] = json!({ "x": 1 });
        value["files"][0]["future"] = json!(true);
        assert!(parse(&value).is_ok());
        let mut value = sample();
        value["files"][0].as_object_mut().unwrap().remove("sha256");
        assert!(matches!(parse(&value), Err(Invalid(e)) if e.starts_with("json:")));
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §4.5: model nhúng giọng đi ở khóa mới `speaker` ở gốc phần thân; app không biết
    /// khóa này (bản 0.3.1 trở về trước) vẫn đọc được manifest và các gói như cũ.
    #[test]
    fn a_speaker_entry_at_the_root_does_not_break_this_app() {
        let mut value = sample();
        value["speaker"] = json!({
            "id": "eres2net-voxceleb", "version": "1", "file": "eres2net-sv-en-voxceleb-16k.onnx",
            "url": "files/eres2net-sv-en-voxceleb-16k.onnx", "bytes": 26_000_000, "sha256": "cd".repeat(32),
            "license_id": "Apache-2.0", "min_app_version": "0.4.0"
        });
        value["speaker_config"] = json!({ "theta": 0.4 });
        let m = parse(&value).unwrap();
        assert_eq!(m.files_of("standard").len(), 4);
    }

    /// Vì sao không đưa model nhúng giọng vào `files`: một `kind` lạ làm app hiện tại từ chối cả manifest.
    #[test]
    fn an_unknown_kind_in_files_breaks_this_app() {
        let mut value = sample();
        value["files"][0]["kind"] = json!("speaker");
        assert!(matches!(parse(&value), Err(Invalid(e)) if e.starts_with("json:")));
    }

    /// Mục `speaker` hợp lệ, `bytes` và `sha256` tùy ý.
    fn speaker_entry(min_app_version: &str) -> Value {
        json!({
            "id": "eres2net-voxceleb", "version": "1", "file": "eres2net-sv-en-voxceleb-16k.onnx",
            "url": "files/eres2net-sv-en-voxceleb-16k.onnx", "bytes": 26_496_496, "sha256": "be".repeat(32),
            "license_id": "Apache-2.0", "min_app_version": min_app_version
        })
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §4.5: model nhúng giọng ở khóa gốc `speaker`, chỉ dùng khi app đủ mới.
    #[test]
    fn the_speaker_entry_is_read_when_valid_and_new_enough() {
        let mut value = sample();
        value["speaker"] = speaker_entry("0.4.0");
        let m = parse(&value).unwrap();
        assert_eq!(m.speaker_model("0.3.1"), None, "app cũ hơn min_app_version");
        let e = m.speaker_model("0.4.0").unwrap();
        assert_eq!(
            (e.id.as_str(), e.kind, e.bytes),
            ("eres2net-voxceleb", Kind::Speaker, 26_496_496)
        );
        assert!(e.tier.is_empty(), "không thuộc gói nào");
        assert!(m.files_of("standard").iter().all(|f| f.kind != Kind::Speaker));
        assert_eq!(
            parse(&sample()).unwrap().speaker_model("9.0.0"),
            None,
            "manifest không có khóa"
        );
    }

    /// Mục sai chỉ làm mất phần nhận giọng; manifest và các gói vẫn dùng được.
    #[test]
    fn a_bad_speaker_entry_is_ignored_without_breaking_the_manifest() {
        for (field, bad) in [
            ("sha256", json!("xyz")),
            ("file", json!("../thoat.onnx")),
            ("file", json!("SILERO_VAD_V6.2.3.ONNX")),
            ("id", json!("silero-vad")),
            ("bytes", json!(0)),
            ("url", json!("http://khong-an-toan/x.onnx")),
            ("min_app_version", json!("moi")),
        ] {
            let mut value = sample();
            value["speaker"] = speaker_entry("0.1.0");
            value["speaker"][field] = bad;
            let m = parse(&value).unwrap();
            assert_eq!(m.speaker_model("9.0.0"), None, "{field}");
            assert_eq!(m.files_of("standard").len(), 4);
        }
        let mut value = sample();
        value["speaker"] = json!("không phải object");
        assert_eq!(parse(&value).unwrap().speaker_model("9.0.0"), None);
    }

    #[test]
    fn speaker_config_comes_from_the_manifest_when_sane() {
        let with = |config: Value| {
            let mut value = sample();
            value["speaker_config"] = config;
            parse(&value).unwrap().speaker_config()
        };
        assert_eq!(with(json!({ "theta": 0.4 })).theta, 0.4);
        assert_eq!(with(json!({ "theta": 0.4 })).max_voices, 8, "khóa thiếu giữ mặc định");
        assert_eq!(with(json!({ "theta": -1.0 })), SpeakerConfig::default());
        assert_eq!(with(json!({ "theta": "cao" })), SpeakerConfig::default());
        assert_eq!(with(json!({ "min_embed_ms": 100 })), SpeakerConfig::default());
        assert_eq!(parse(&sample()).unwrap().speaker_config(), SpeakerConfig::default());
    }

    #[test]
    fn rejects_bad_files() {
        rejects(|v| v["schema"] = json!(2), "schema");
        rejects(|v| v["files"][1]["id"] = json!("whisper-turbo"), "files[1].id");
        rejects(|v| v["files"][0]["id"] = json!("Whisper"), "files[0].id");
        rejects(|v| v["files"][0]["tier"] = json!([]), "files[0].tier");
        rejects(|v| v["files"][0]["tier"] = json!(["hybrid"]), "files[0].tier");
        rejects(|v| v["files"][0]["version"] = json!(""), "files[0].version");
        for name in [
            "../x.bin",
            ".hidden",
            "a/b.bin",
            "a\\b.bin",
            "x.bin.part",
            "x.BIN.PART",
            "",
            "installed.json",
            "State.json",
            "manifest.json",
            "x.tmp",
            "x.bin.",
            "CON",
            "nul.bin",
            "Aux.txt",
            "com1.gguf",
        ] {
            rejects(|v| v["files"][0]["file"] = json!(name), "files[0].file");
        }
        rejects(
            |v| v["files"][1]["file"] = json!("ggml-large-v3-turbo-q5_0.bin"),
            "files[1].file",
        );
        rejects(
            |v| v["files"][1]["file"] = json!("GGML-large-v3-turbo-q5_0.BIN"),
            "files[1].file",
        );
        for url in [
            "http://cdn.example/x.bin",
            "files/../x.bin",
            "/x.bin",
            "files//x.bin",
            "files/a b.bin",
        ] {
            rejects(|v| v["files"][0]["url"] = json!(url), "files[0].url");
        }
        rejects(|v| v["files"][0]["bytes"] = json!(0), "files[0].bytes");
        rejects(|v| v["files"][0]["bytes"] = json!(MAX_FILE_BYTES + 1), "files[0].bytes");
        rejects(|v| v["files"][0]["sha256"] = json!("AB".repeat(32)), "files[0].sha256");
        rejects(|v| v["files"][0]["sha256"] = json!("ab".repeat(31)), "files[0].sha256");
        rejects(|v| v["files"][0]["license_id"] = json!(" "), "files[0].license_id");
        rejects(
            |v| v["files"][0]["min_app_version"] = json!("1.0"),
            "files[0].min_app_version",
        );
    }

    #[test]
    fn rejects_bad_packs_and_rules() {
        rejects(|v| v["packs"] = json!([]), "packs");
        rejects(|v| v["packs"][1]["id"] = json!("standard"), "packs[1].id");
        rejects(|v| v["packs"][0]["note"]["en"] = json!(""), "packs[0].note.en");
        rejects(
            |v| v["packs"][0]["name"]["vi"] = json!("x".repeat(501)),
            "packs[0].name.vi",
        );
        // Gói Nhẹ thiếu VAD; gói Chuẩn có hai file nhận dạng.
        rejects(|v| v["files"][4]["tier"] = json!(["standard"]), "packs[1].files");
        rejects(
            |v| v["files"][1]["tier"] = json!(["lite", "standard"]),
            "packs[0].files",
        );
        rejects(|v| v["recommend"]["min_ram_mib"] = json!(0), "recommend.min_ram_mib");
        rejects(
            |v| v["recommend"]["rules"][0]["pack"] = json!("hybrid"),
            "recommend.rules[0].pack",
        );
        rejects(
            |v| {
                v["recommend"]["rules"][1].as_object_mut().unwrap().remove("gpu");
            },
            "recommend.rules[1].gpu",
        );
        rejects(|v| v["recommend"]["fallback"] = json!("hybrid"), "recommend.fallback");
    }

    #[test]
    fn absolute_https_urls_are_allowed() {
        let mut value = sample();
        value["files"][0]["url"] = json!("https://models.example/whisper/x.bin");
        assert!(parse(&value).is_ok());
    }

    #[test]
    fn a_pack_needs_a_new_enough_app() {
        let mut value = sample();
        value["files"][1]["min_app_version"] = json!("0.2.0");
        let m = parse(&value).unwrap();
        assert!(m.usable_by("standard", "0.1.0"));
        assert!(!m.usable_by("lite", "0.1.0"));
        assert!(m.usable_by("lite", "0.2.0"));
        assert!(m.usable_by("lite", "1.0.0-beta.1"));
        assert!(!m.usable_by("hybrid", "9.9.9"));
    }

    #[test]
    fn versions_compare_by_number() {
        assert_eq!(version("0.10.2"), Some((0, 10, 2)));
        assert_eq!(version("1.2.3-beta.4+build"), Some((1, 2, 3)));
        assert!(version("0.10.2") > version("0.9.9"));
        for bad in ["1.2", "1.2.3.4", "a.b.c", "", "1..2"] {
            assert_eq!(version(bad), None, "{bad}");
        }
    }

    #[test]
    fn ordinary_names_are_safe() {
        for name in ["ggml-small-q5_1.bin", "NOTICE.txt", "console.bin", "nuls.gguf", "a.b.c"] {
            assert!(is_safe_file_name(name), "{name}");
        }
    }

    /// Kiểm phần thân manifest model trước khi ký và upload (04b Task 13): đọc file ở `MANIFEST_BODY`, kiểm như app
    /// kiểm, in dung lượng từng gói. `MANIFEST_PREVIOUS` (nếu có): phần thân của bản đang phát hành; bản mới không được
    /// đổi `id` của file model (`renamed_ids`). Chạy tay:
    /// `MANIFEST_BODY=<body.json> cargo test -p meeting-translator --lib check_manifest_body -- --ignored --nocapture`
    #[test]
    #[ignore = "chạy tay với MANIFEST_BODY"]
    fn check_manifest_body() {
        let path = std::env::var("MANIFEST_BODY").expect("đặt MANIFEST_BODY");
        let m = Manifest::parse(&std::fs::read(path).unwrap()).unwrap();
        let late = m.prompt_needs_newer_app();
        assert!(late.is_empty(), "{late:?}");
        if m.speaker.is_some() {
            assert!(m.speaker_model("999.0.0").is_some(), "mục `speaker` không hợp lệ");
        }
        if let Some(config) = &m.speaker_config {
            let config: speaker_protocol::SpeakerConfig =
                serde_json::from_value(config.clone()).expect("speaker_config đọc được");
            config.validate().expect("speaker_config hợp lệ");
        }
        if let Ok(previous) = std::env::var("MANIFEST_PREVIOUS") {
            let old = Manifest::parse(&std::fs::read(previous).unwrap()).unwrap();
            assert!(old.sequence < m.sequence, "sequence phải tăng");
            let renamed = renamed_ids(&old, &m);
            assert!(renamed.is_empty(), "đổi id của file model: {renamed:?}");
            println!(
                "so với bản trước: sequence {} -> {}, không đổi id",
                old.sequence, m.sequence
            );
        }
        for p in &m.packs {
            println!(
                "{}: {} file, {} byte",
                p.id,
                m.files_of(&p.id).len(),
                m.pack_bytes(&p.id)
            );
        }
        println!("sequence {}", m.sequence);
    }

    #[test]
    fn mt_files_carry_a_prompt_family() {
        let m = parse(&sample()).unwrap();
        let mt = |m: &Manifest, pack: &str| {
            m.files_of(pack)
                .into_iter()
                .find(|f| f.kind == Kind::Mt)
                .cloned()
                .unwrap()
        };
        assert_eq!(
            mt(&m, "standard").prompt_family(),
            Some(PromptFamily::HyMt2),
            "bỏ trống là hy-mt2"
        );
        let mut value = sample();
        value["files"][3]["prompt"] = json!("lmt");
        let m = parse(&value).unwrap();
        assert_eq!(mt(&m, "lite").prompt_family(), Some(PromptFamily::Lmt));
        assert_eq!(serde_json::to_value(mt(&m, "lite")).unwrap()["prompt"], "lmt");
        assert!(
            serde_json::to_value(mt(&m, "standard"))
                .unwrap()
                .get("prompt")
                .is_none()
        );
    }

    #[test]
    fn prompt_is_only_for_mt_files() {
        rejects(|v| v["files"][0]["prompt"] = json!("lmt"), "files[0].prompt");
        rejects(|v| v["files"][3]["prompt"] = json!("LMT 2"), "files[3].prompt");
    }

    #[test]
    fn an_unknown_prompt_family_makes_only_that_pack_unusable() {
        let mut value = sample();
        value["files"][3]["prompt"] = json!("tower");
        let m = parse(&value).expect("manifest vẫn đọc được");
        assert!(!m.usable_by("lite", "9.9.9"));
        assert!(m.usable_by("standard", "0.1.0"));
    }

    #[test]
    fn non_hy_mt2_prompts_need_a_new_enough_min_app_version() {
        let mut value = sample();
        value["files"][2]["prompt"] = json!("hy-mt2");
        assert!(parse(&value).unwrap().prompt_needs_newer_app().is_empty());
        value["files"][3]["prompt"] = json!("lmt");
        assert_eq!(
            parse(&value).unwrap().prompt_needs_newer_app(),
            ["files[3]: lmt cần min_app_version >= 0.2.0"]
        );
        value["files"][3]["min_app_version"] = json!("0.2.0");
        assert!(parse(&value).unwrap().prompt_needs_newer_app().is_empty());
    }

    /// N-8 của review 04 lần 2: bản mới đổi `id` của file model thì bị báo; đổi `file`, `version` thì không.
    #[test]
    fn renamed_model_ids_are_reported() {
        let old = parse(&sample()).unwrap();
        let mut value = sample();
        value["files"][3]["file"] = json!("Hy-MT2-1.8B-Q4_K_M-v2.gguf");
        value["files"][3]["version"] = json!("2");
        assert_eq!(renamed_ids(&old, &parse(&value).unwrap()), Vec::<String>::new());
        value["files"][3]["id"] = json!("hy-mt2-q4-v2");
        value["files"][4]["id"] = json!("silero-vad-6.3");
        assert_eq!(
            renamed_ids(&old, &parse(&value).unwrap()),
            [
                "standard Vad: silero-vad -> silero-vad-6.3",
                "lite Mt: hy-mt2-q4 -> hy-mt2-q4-v2",
                "lite Vad: silero-vad -> silero-vad-6.3",
            ]
        );
    }

    /// Dòng 338 của bảng đối chiếu: ngưỡng của pipeline đổi được bằng manifest; giá trị vô lý thì giữ mặc định.
    #[test]
    fn pipeline_thresholds_come_from_the_manifest_when_sane() {
        let m = parse(&sample()).unwrap();
        assert_eq!(m.pipeline_config(), PipelineConfig::default());
        let mut value = sample();
        value["pipeline"] = json!({ "queue": { "lag_warn_ms": 8000 } });
        assert_eq!(parse(&value).unwrap().pipeline_config().queue.lag_warn_ms, 8_000);
        value["pipeline"] = json!({ "filter": { "no_speech_prob_max": 1.5 } });
        assert_eq!(parse(&value).unwrap().pipeline_config(), PipelineConfig::default());
        value["pipeline"] = json!({ "queue": { "lag_warn_ms": "nhiều" } });
        assert_eq!(parse(&value).unwrap().pipeline_config(), PipelineConfig::default());
    }
}
