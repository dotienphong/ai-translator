//! Ngưỡng của pipeline, gom vào một chỗ (spec §6.3–§6.5, §7, §9). Giá trị mặc định là số đã chốt ở Phase 0.
//!
//! Kế hoạch 04 nạp các ngưỡng này từ manifest đã ký: mọi struct đều `#[serde(default)]`, nên manifest chỉ cần ghi khóa
//! muốn đổi, khóa lạ bị bỏ qua (manifest mới hơn app). Sau khi nạp, gọi [`PipelineConfig::validate`]; lỗi thì giữ mặc
//! định. `vadEndSilenceMs` của người dùng (50–800 ms) không nằm ở đây: session ghi đè `segmenter.end_silence_ms`.
//!
//! Vài hằng số cố ý để ngoài, vì chúng không đổi hành vi dịch và manifest đổi chúng sai thì khó chẩn đoán:
//! - chu kỳ kiểm nguồn âm thanh (`WATCH_EVERY`, 500 ms, spec §6.2) và nhịp ghi phút (`TICK_EVERY`) của app;
//! - timeout của lượt thử GPU (`PROBE_TIMEOUT`), gắn với cách đo của `gpu_probe`;
//! - kích thước xoay log của tiến trình phụ, thuộc phần chẩn đoán chứ không thuộc pipeline.
//!
//! Hạn dịch câu cuối khi Dừng thì nằm ở đây (`mt.stop_grace_ms`), vì nó quyết định câu nào thành `skipped`.

use crate::prompt::{Lang, PromptFamily};
use crate::segmenter::SegmenterConfig;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PipelineConfig {
    pub segmenter: SegmenterConfig,
    pub merge: MergeConfig,
    pub filter: FilterConfig,
    pub asr: AsrConfig,
    pub mt: MtConfig,
    pub queue: QueueConfig,
    pub supervisor: SupervisorConfig,
    pub audio: AudioConfig,
    /// Dịch trong lúc người nói chưa dừng (spec 2026-10-10 §4–§5).
    pub streaming: StreamingConfig,
}

/// Ghép câu và phụ đề tạm (§6.3).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MergeConfig {
    /// Cửa sổ ghép = max(`window_min_ms`, `vadEndSilenceMs` + `window_extra_ms`).
    pub window_min_ms: u64,
    pub window_extra_ms: u64,
    /// Trần của một câu ghép: tổng tiếng nói (không tính đệm và khoảng nghỉ) hoặc số đoạn.
    pub max_speech_ms: u64,
    pub max_segments: usize,
}

impl Default for MergeConfig {
    fn default() -> Self {
        Self {
            window_min_ms: 700,
            window_extra_ms: 400,
            max_speech_ms: 15_000,
            max_segments: 3,
        }
    }
}

/// Lọc lỗi ảo giác ở tiến trình chính (§6.4).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct FilterConfig {
    /// Bỏ đoạn khi `no_speech_prob > no_speech_prob_max` **và** `avg_logprob < avg_logprob_min` (luật của OpenAI Whisper).
    pub no_speech_prob_max: f32,
    pub avg_logprob_min: f32,
    /// Câu hay bị bịa ra khi chỉ có nhạc hoặc im lặng. Đoạn chỉ gồm các câu này (sau khi chuẩn hóa) thì bị bỏ. Cụm có
    /// ngoặc (`[music]`, `(music)`) là nhãn: so khớp nguyên dạng có ngoặc, nên câu thật "Music." không bị bỏ.
    pub hallucination_phrases: Vec<String>,
    /// Câu đệm ngắn mà model hay bịa ra từ tiếng ồn (Q11 của review 02b). Khác `hallucination_phrases`: đây cũng là câu
    /// thật trong cuộc họp, nên chỉ bị bỏ khi có thêm ít nhất một dấu hiệu dưới đây.
    pub filler_phrases: Vec<String>,
    /// Dấu hiệu 1: `avg_logprob` dưới ngưỡng này.
    pub filler_logprob_max: f32,
    /// Dấu hiệu 2: xác suất tiếng nói trung bình của VAD trên các khung tiếng nói (`Segment::mean_prob`) dưới ngưỡng này.
    pub filler_vad_prob_max: f32,
    /// Dấu hiệu 3: đoạn có tiếng nói từ chừng này ms mà chỉ có tối đa `filler_long_max_words` từ.
    pub filler_long_ms: u64,
    pub filler_long_max_words: usize,
    /// Tỉ lệ nén zlib của chữ (byte UTF-8 chia byte sau nén) lớn hơn ngưỡng này thì coi là chuỗi lặp và bỏ đoạn, như
    /// `compression_ratio_threshold` của OpenAI Whisper.
    pub compression_ratio_max: f32,
    /// Đổi chữ phồn thể sang giản thể cho đoạn tiếng Trung (§6.4, "Việc cho MVP"; `small` hay ra phồn thể).
    pub simplify_chinese: bool,
}

/// Câu đệm mặc định, theo ngôn ngữ: en, vi, ja, zh, ko. "I" đứng một mình là chữ bịa của gói Nhẹ trên nhạc
/// (`bench/phase0/results/gd1_no_speech.md`).
pub const DEFAULT_FILLER_PHRASES: &[&str] = &[
    "you",
    "i",
    "so",
    "okay",
    "ok",
    "bye",
    "bye bye",
    "thanks",
    "thank you",
    "thank you very much",
    "cảm ơn",
    "xin cảm ơn",
    "cảm ơn các bạn",
    "ありがとうございました",
    "ありがとうございます",
    "谢谢",
    "谢谢大家",
    "감사합니다",
    "고맙습니다",
];

/// Danh sách mặc định: câu trong spec §6.4 cộng các biến thể hay gặp của cùng loại (cảm ơn đã xem, mời đăng ký kênh,
/// phụ đề do ai làm, nhãn nhạc). Không có "Thank you." hay "Cảm ơn." đứng riêng: đó là câu thật trong cuộc họp.
pub const DEFAULT_HALLUCINATION_PHRASES: &[&str] = &[
    "thank you for watching",
    "thanks for watching",
    "thank you so much for watching",
    "please subscribe",
    "please like and subscribe",
    "subscribe to my channel",
    "hãy subscribe cho kênh",
    "hãy đăng ký kênh",
    "cảm ơn các bạn đã theo dõi",
    "[music]",
    "(music)",
    // Mọi kiểu ngoặc so như nhau (`filter::compact`), nên "[âm nhạc]" và "(âm nhạc)" là cùng một nhãn. Giữ cả hai cho
    // dễ đọc, như "[music]" và "(music)": cố ý, không phải sót.
    "[âm nhạc]",
    "(âm nhạc)",
    "(音楽)",
    "[音乐]",
    "[음악]",
    "♪",
    "ご視聴ありがとうございました",
    "チャンネル登録お願いします",
    "请不吝点赞 订阅 转发 打赏支持明镜与点点栏目",
    "字幕由amara.org社区提供",
    "谢谢观看",
    "시청해 주셔서 감사합니다",
    "구독과 좋아요 부탁드립니다",
];

impl Default for FilterConfig {
    fn default() -> Self {
        Self {
            no_speech_prob_max: 0.6,
            avg_logprob_min: -1.0,
            hallucination_phrases: DEFAULT_HALLUCINATION_PHRASES.iter().map(|s| s.to_string()).collect(),
            filler_phrases: DEFAULT_FILLER_PHRASES.iter().map(|s| s.to_string()).collect(),
            filler_logprob_max: -0.7,
            filler_vad_prob_max: 0.7,
            filler_long_ms: 2_000,
            filler_long_max_words: 1,
            compression_ratio_max: 2.4,
            simplify_chinese: true,
        }
    }
}

/// Gọi `asr-worker` (§6.4).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AsrConfig {
    /// Số token prompt tối đa (`asr_protocol::MAX_PROMPT_TOKENS`); app còn cắt bớt để prompt không làm giảm trần token mới
    /// (xem `prompt_history`).
    pub max_prompt_tokens: usize,
    pub n_threads: u32,
    /// Một đoạn không có kết quả sau chừng này thì coi như worker treo: kill và khởi động lại (§9).
    pub timeout_ms: u64,
}

impl Default for AsrConfig {
    fn default() -> Self {
        Self {
            max_prompt_tokens: asr_protocol::MAX_PROMPT_TOKENS,
            n_threads: 4,
            timeout_ms: 30_000,
        }
    }
}

/// Ngưỡng tỉ lệ token (token bản dịch chia token câu gốc) của một cặp ngôn ngữ (§6.5).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PairRatio {
    pub src: String,
    pub tgt: String,
    pub ratio: f32,
}

/// Dịch (§6.5).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MtConfig {
    pub repeat_penalty: f64,
    /// Lần thử lại duy nhất dùng repeat penalty cao hơn: với temperature 0, giữ nguyên tham số thì ra y hệt lần trước.
    pub retry_repeat_penalty: f64,
    /// Số token tối đa = min(`max_tokens_per_source_token` × số token câu gốc + `max_tokens_extra`, `max_tokens_cap`).
    pub max_tokens_per_source_token: u32,
    pub max_tokens_extra: u32,
    pub max_tokens_cap: u32,
    /// Ngưỡng theo cặp: 8 chiều có tiếng Việt lấy ở S7, 12 chiều không có tiếng Việt lấy ở Đ12. Cặp không có trong
    /// danh sách (ví dụ manifest chỉ ghi vài cặp) thì không kiểm tỉ lệ, chỉ chịu hạn mức sinh.
    pub ratio_thresholds: Vec<PairRatio>,
    /// Ngưỡng của gói Nhanh (LMT, tokenizer Qwen3), đo theo cùng cách (spec 2026-10-21-goi-nhanh §6.2). Cặp không có thì
    /// không kiểm tỉ lệ.
    pub ratio_thresholds_lmt: Vec<PairRatio>,
    /// Chỉ kiểm tỉ lệ khi câu gốc có từ chừng này token (cách 2 của Q4, đề xuất của kế hoạch 00).
    pub ratio_min_source_tokens: usize,
    /// Timeout của một request dịch (kể cả stream).
    pub request_timeout_ms: u64,
    /// Khi bấm Dừng, câu cuối được dịch trong hạn chung này; quá hạn thì câu đó thành `skipped` (§7).
    pub stop_grace_ms: u64,
    /// Họ mẫu prompt của model đang nạp. App đặt theo `ModelFiles::mt_prompt` của bộ tiến trình phụ đang chạy; manifest
    /// không ghi đè được (`serde(skip)`).
    #[serde(skip)]
    pub prompt_family: PromptFamily,
}

/// Ngưỡng tỉ lệ token mặc định, đều là tỉ lệ lớn nhất đo được trên các câu gốc từ 10 token cộng biên 25%, làm tròn
/// lên 0,1. Cách lấy này khớp với `ratio_min_source_tokens` = 10 (cách 2 của Q4): câu ngắn hơn không bị kiểm.
///
/// - Tám chiều có tiếng Việt (S7): cột "câu gốc ≥ 10 token" của bảng ngưỡng trong
///   `bench/phase0/results/s7_mt_decisions.md`. Tính lại cho cả tám cặp từ `bench/phase0/data/mt/outputs/*-plain.jsonl`
///   ngày 2026-10-01, cùng số với bảng.
/// - Mười hai chiều không có tiếng Việt (Đ12, điểm cần quyết 4 của 02a): mục "Đề xuất" của
///   `bench/phase0/results/gd1_mt_ratio.md`, lấy số lớn hơn của Hy-MT2 Q8_0 và Q4_K_M, để một bộ ngưỡng dùng chung
///   cho cả gói Chuẩn lẫn gói Nhanh.
pub const DEFAULT_RATIO_THRESHOLDS: &[(&str, &str, f32)] = &[
    ("en", "vi", 4.4),
    ("zh", "vi", 4.3),
    ("ja", "vi", 3.5),
    ("ko", "vi", 3.5),
    ("vi", "en", 1.4),
    ("vi", "zh", 1.2),
    ("vi", "ja", 2.2),
    ("vi", "ko", 2.2),
    // Đ12: `bench/phase0/results/gd1_mt_ratio.md`, max của Q8_0 và Q4_K_M.
    ("en", "ja", 3.3),
    ("en", "ko", 3.2),
    ("en", "zh", 2.0),
    ("ja", "en", 1.7),
    ("ja", "ko", 2.8),
    ("ja", "zh", 1.5),
    ("ko", "en", 1.9),
    ("ko", "ja", 2.0),
    ("ko", "zh", 1.3),
    ("zh", "en", 2.7),
    ("zh", "ja", 3.8),
    ("zh", "ko", 3.7),
];

/// Ngưỡng tỉ lệ token của LMT-60-0.6B Q8_0, cách lấy như [`DEFAULT_RATIO_THRESHOLDS`], đo ở Task 6 của kế hoạch gói
/// Nhanh (`bench/2026-10-21-goi-nhanh/ratio.md`).
pub const DEFAULT_RATIO_THRESHOLDS_LMT: &[(&str, &str, f32)] = &[];

fn pair_ratios(table: &[(&str, &str, f32)]) -> Vec<PairRatio> {
    table
        .iter()
        .map(|&(src, tgt, ratio)| PairRatio {
            src: src.into(),
            tgt: tgt.into(),
            ratio,
        })
        .collect()
}

impl Default for MtConfig {
    fn default() -> Self {
        Self {
            repeat_penalty: 1.05,
            retry_repeat_penalty: 1.15,
            max_tokens_per_source_token: 4,
            max_tokens_extra: 32,
            max_tokens_cap: 512,
            ratio_thresholds: pair_ratios(DEFAULT_RATIO_THRESHOLDS),
            ratio_thresholds_lmt: pair_ratios(DEFAULT_RATIO_THRESHOLDS_LMT),
            ratio_min_source_tokens: 10,
            request_timeout_ms: 120_000,
            stop_grace_ms: 3_000,
            prompt_family: PromptFamily::default(),
        }
    }
}

impl MtConfig {
    /// min(4 × số token câu gốc + 32, 512) với mặc định (§6.5).
    pub fn max_tokens_for(&self, source_tokens: usize) -> u32 {
        let per = self.max_tokens_per_source_token as usize;
        source_tokens
            .saturating_mul(per)
            .saturating_add(self.max_tokens_extra as usize)
            .min(self.max_tokens_cap as usize) as u32
    }

    /// Ngưỡng của cặp theo bảng của họ prompt đang dùng (spec gói Nhanh §6.2).
    pub fn ratio_for(&self, src: &str, tgt: &str) -> Option<f32> {
        let table = match self.prompt_family {
            PromptFamily::HyMt2 => &self.ratio_thresholds,
            PromptFamily::Lmt => &self.ratio_thresholds_lmt,
        };
        table.iter().find(|p| p.src == src && p.tgt == tgt).map(|p| p.ratio)
    }
}

/// Hàng đợi và chống nghẽn (§7).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct QueueConfig {
    /// Hàng đợi VAD → nhận dạng chứa tối đa chừng này đoạn; đầy thì gộp hai đoạn chờ lâu nhất nếu tổng không quá
    /// `asr_merge_max_ms`.
    pub asr_max_waiting: usize,
    pub asr_merge_max_ms: u64,
    /// Chỉ bỏ đoạn (`dropped`) khi độ trễ vượt mức này.
    pub asr_drop_after_ms: u64,
    /// Độ trễ vượt mức này thì hiện chỉ báo "Đang trễ".
    pub lag_warn_ms: u64,
    /// Hàng đợi dịch chứa tối đa chừng này câu; đầy thì gộp các câu liên tiếp cùng ngôn ngữ.
    pub mt_max_waiting: usize,
    /// Câu chờ dịch quá mức này thì bỏ bước dịch, chỉ hiện câu gốc (`skipped`).
    pub mt_skip_after_ms: u64,
}

impl Default for QueueConfig {
    fn default() -> Self {
        Self {
            asr_max_waiting: 3,
            asr_merge_max_ms: 12_000,
            asr_drop_after_ms: 20_000,
            lag_warn_ms: 6_000,
            mt_max_waiting: 3,
            mt_skip_after_ms: 20_000,
        }
    }
}

/// Vòng đời và giám sát hai tiến trình phụ (§5, §6.4, §6.5, §9).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SupervisorConfig {
    /// Chờ trước lần khởi động lại thứ 1, 2, 3 trở đi.
    pub backoff_ms: Vec<u64>,
    /// Quá chừng này lần lỗi trong `failure_window_ms` thì bỏ cuộc và báo lỗi.
    pub max_failures: usize,
    pub failure_window_ms: u64,
    /// Crash chừng này lần liên tiếp khi đang dùng GPU thì chuyển sang CPU.
    pub gpu_failures_to_cpu: u32,
    /// Chờ `Ready` hoặc `/health` khi khởi động.
    pub ready_timeout_ms: u64,
    /// Lần đầu chạy một binary mới (sau khi cài hoặc cập nhật), macOS kiểm tra khoảng 15 giây: chờ lâu hơn, và lần chờ này
    /// không tính là lỗi (§6.5). Phải từ 30 giây trở lên.
    pub first_run_ready_timeout_ms: u64,
    /// Không dịch chừng này thì tắt hai tiến trình phụ (§5).
    pub idle_shutdown_ms: u64,
    /// Chờ tiến trình phụ tự thoát sau `Shutdown` trước khi kill.
    pub shutdown_grace_ms: u64,
}

impl Default for SupervisorConfig {
    fn default() -> Self {
        Self {
            backoff_ms: vec![1_000, 2_000, 5_000],
            max_failures: 5,
            failure_window_ms: 600_000,
            gpu_failures_to_cpu: 2,
            ready_timeout_ms: 60_000,
            first_run_ready_timeout_ms: 180_000,
            idle_shutdown_ms: 600_000,
            shutdown_grace_ms: 5_000,
        }
    }
}

/// Luồng âm thanh vào (§6.1, §9).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AudioConfig {
    /// Đang dịch mà RMS dưới `silent_rms` liên tục chừng này thì báo "Không nghe thấy âm thanh".
    pub no_audio_after_ms: u64,
    pub silent_rms: f32,
    /// Chu kỳ gửi mức âm lượng cho giao diện.
    pub level_interval_ms: u64,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            no_audio_after_ms: 60_000,
            silent_rms: 0.000_5,
            level_interval_ms: 100,
        }
    }
}

/// Số bản dịch tạm phải trùng phần đầu, và số đơn vị cuối chừa lại, theo tiếng nguồn (spec 2026-10-10 §4.4).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct LangAgree {
    pub lang: String,
    /// Số bản dịch tạm liền nhau phải trùng phần đầu (spec §4.4).
    pub n: usize,
    /// Số đơn vị cuối chừa lại, không chốt — đếm theo đơn vị của NGÔN NGỮ ĐÍCH (bản dịch sẽ tạo ra), không phải theo
    /// `lang` (tiếng nguồn dùng để tra cứu mục này).
    pub k: usize,
}

impl Default for LangAgree {
    fn default() -> Self {
        Self {
            lang: String::new(),
            n: 2,
            k: 1,
        }
    }
}

impl LangAgree {
    fn new(lang: &str, n: usize, k: usize) -> Self {
        Self {
            lang: lang.to_string(),
            n,
            k,
        }
    }

    /// Bảng của H3: `n` trong 2..=5, `k` ≤ 10.
    fn is_valid(&self) -> bool {
        (2..=5).contains(&self.n) && self.k <= 10
    }
}

/// Dịch trong lúc người nói chưa dừng (spec 2026-10-10 §4–§5).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct StreamingConfig {
    /// Đoạn mở có từ chừng này tiếng nói mới được chép từng phần theo nhịp (§4.1).
    pub min_partial_speech_ms: u64,
    /// Từ lần chép từng phần trước phải có thêm chừng này tiếng nói (§4.1).
    pub min_new_speech_ms: u64,
    /// Ngưỡng im lặng tối thiểu để đóng đoạn ở chế độ này (§4.7). 50 ms: QĐ4, chủ dự án chốt ở cổng của kế hoạch 02 ngày
    /// 2026-10-12 (`bench/2026-10-10-do-tre/results/buoc2-cong.md`).
    pub end_silence_ms: u64,
    /// Số đơn vị cuối của bản chép chưa chốt: từ (§4.2) …
    pub src_holdback_words: usize,
    /// … hay chữ, với tiếng Trung và tiếng Nhật.
    pub src_holdback_chars: usize,
    /// (n, k) để chốt phần dịch, theo tiếng nguồn (§4.4). Nạp từ manifest thì THAY THẾ CẢ DANH SÁCH (như
    /// `mt.ratio_thresholds`), không gộp theo từng tiếng: phải ghi đủ mọi tiếng muốn giữ giá trị riêng, tiếng bị bỏ
    /// sót rơi về `tgt_agree_fallback` — mức kém thận trọng nhất trong bảng mặc định, không phải giá trị mặc định
    /// của tiếng đó.
    pub tgt_agree: Vec<LangAgree>,
    /// (n, k) khi tiếng nguồn không có trong `tgt_agree` (so khớp theo `lang`, xem [`StreamingConfig::agree_for`]).
    /// `lang` của giá trị này cố ý để rỗng vì nó không tham gia so khớp — không phải "giá trị mặc định cho tiếng có
    /// mã rỗng".
    pub tgt_agree_fallback: LangAgree,
    /// Số vòng cập nhật gần nhất lấy trung vị (§5).
    pub cycle_window: usize,
    /// T = `cadence_factor` × trung vị, kẹp trong [`min_cadence_ms`, `max_cadence_ms`] (§5).
    pub cadence_factor: f32,
    pub min_cadence_ms: u64,
    pub max_cadence_ms: u64,
    /// T khi chưa đủ `warmup_cycles` vòng.
    pub initial_cadence_ms: u64,
    pub warmup_cycles: usize,
    /// Trung vị của `cycle_window` vòng gần nhất lớn hơn số này thì chế độ này tắt tới hết phiên (§5). Phải
    /// ≤ `max_cadence_ms`: lớn hơn thì nhịp T đã bị kẹp ở `max_cadence_ms` (nhỏ hơn trung vị thật, vòng sau bắt đầu
    /// trước khi vòng trước xong) từ trước khi cơ chế tự tắt kịp kích hoạt.
    pub auto_off_cycle_ms: u64,
}

impl Default for StreamingConfig {
    fn default() -> Self {
        Self {
            min_partial_speech_ms: 1_000,
            min_new_speech_ms: 300,
            end_silence_ms: 50,
            src_holdback_words: 1,
            src_holdback_chars: 2,
            // Chốt ở cổng của kế hoạch 02 (spec 2026-10-10 §4.4).
            tgt_agree: vec![
                LangAgree::new("en", 2, 1),
                LangAgree::new("vi", 2, 1),
                LangAgree::new("zh", 2, 2),
                LangAgree::new("ja", 3, 2),
                LangAgree::new("ko", 3, 2),
            ],
            tgt_agree_fallback: LangAgree::new("", 2, 1),
            cycle_window: 8,
            cadence_factor: 1.5,
            min_cadence_ms: 700,
            max_cadence_ms: 2_000,
            initial_cadence_ms: 1_000,
            warmup_cycles: 3,
            auto_off_cycle_ms: 1_300,
        }
    }
}

impl StreamingConfig {
    /// (n, k) theo tiếng nguồn; không có trong `tgt_agree` thì dùng `tgt_agree_fallback`.
    pub fn agree_for(&self, src_lang: &str) -> (usize, usize) {
        let a = self
            .tgt_agree
            .iter()
            .find(|a| a.lang == src_lang)
            .unwrap_or(&self.tgt_agree_fallback);
        (a.n, a.k)
    }
}

impl PipelineConfig {
    /// Kiểm phạm vi, trả tên khóa đầu tiên sai. Dùng khi nạp từ manifest (kế hoạch 04).
    pub fn validate(&self) -> Result<(), String> {
        let s = &self.segmenter;
        let q = &self.queue;
        let v = &self.supervisor;
        let st = &self.streaming;
        let checks: Vec<(&str, bool)> = vec![
            (
                "segmenter.threshold",
                (0.0..1.0).contains(&s.threshold) && s.threshold > 0.0,
            ),
            ("segmenter.end_silence_ms", (100..=2_000).contains(&s.end_silence_ms)),
            ("segmenter.max_segment_ms", (2_000..=28_000).contains(&s.max_segment_ms)),
            (
                "segmenter.force_cut_window_ms",
                s.force_cut_window_ms > 0 && s.force_cut_window_ms < s.max_segment_ms,
            ),
            ("segmenter.pad_ms", s.pad_ms <= 1_000),
            ("merge.window_min_ms", (100..=5_000).contains(&self.merge.window_min_ms)),
            (
                "merge.window_extra_ms",
                (100..=5_000).contains(&self.merge.window_extra_ms),
            ),
            ("merge.max_segments", self.merge.max_segments >= 1),
            ("merge.max_speech_ms", self.merge.max_speech_ms > 0),
            (
                "filter.no_speech_prob_max",
                (0.0..=1.0).contains(&self.filter.no_speech_prob_max),
            ),
            ("filter.avg_logprob_min", self.filter.avg_logprob_min <= 0.0),
            ("filter.filler_logprob_max", self.filter.filler_logprob_max <= 0.0),
            (
                "filter.filler_vad_prob_max",
                (0.0..=1.0).contains(&self.filter.filler_vad_prob_max),
            ),
            ("filter.compression_ratio_max", self.filter.compression_ratio_max >= 1.0),
            (
                "asr.max_prompt_tokens",
                self.asr.max_prompt_tokens <= asr_protocol::MAX_PROMPT_TOKENS,
            ),
            ("asr.n_threads", (1..=64).contains(&self.asr.n_threads)),
            ("asr.timeout_ms", self.asr.timeout_ms >= 1_000),
            ("mt.repeat_penalty", self.mt.repeat_penalty >= 1.0),
            (
                "mt.retry_repeat_penalty",
                self.mt.retry_repeat_penalty >= self.mt.repeat_penalty,
            ),
            (
                "mt.max_tokens_per_source_token",
                self.mt.max_tokens_per_source_token >= 1,
            ),
            ("mt.max_tokens_cap", self.mt.max_tokens_cap >= 16),
            (
                "mt.ratio_thresholds",
                self.mt
                    .ratio_thresholds
                    .iter()
                    .all(|p| p.ratio.is_finite() && p.ratio > 0.0),
            ),
            (
                "mt.ratio_thresholds_lmt",
                self.mt
                    .ratio_thresholds_lmt
                    .iter()
                    .all(|p| p.ratio.is_finite() && p.ratio > 0.0),
            ),
            ("mt.request_timeout_ms", self.mt.request_timeout_ms >= 1_000),
            ("mt.stop_grace_ms", self.mt.stop_grace_ms <= 30_000),
            ("queue.asr_max_waiting", q.asr_max_waiting >= 1),
            ("queue.asr_merge_max_ms", (1..=30_000).contains(&q.asr_merge_max_ms)),
            ("queue.asr_drop_after_ms", q.asr_drop_after_ms >= 1_000),
            ("queue.mt_max_waiting", q.mt_max_waiting >= 1),
            ("queue.mt_skip_after_ms", q.mt_skip_after_ms >= 1_000),
            ("supervisor.backoff_ms", !v.backoff_ms.is_empty()),
            ("supervisor.max_failures", v.max_failures >= 1),
            ("supervisor.failure_window_ms", v.failure_window_ms >= 60_000),
            ("supervisor.gpu_failures_to_cpu", v.gpu_failures_to_cpu >= 1),
            ("supervisor.ready_timeout_ms", v.ready_timeout_ms >= 5_000),
            (
                "supervisor.first_run_ready_timeout_ms",
                v.first_run_ready_timeout_ms >= 30_000 && v.first_run_ready_timeout_ms >= v.ready_timeout_ms,
            ),
            ("supervisor.idle_shutdown_ms", v.idle_shutdown_ms >= 10_000),
            ("supervisor.shutdown_grace_ms", v.shutdown_grace_ms >= 100),
            ("audio.no_audio_after_ms", self.audio.no_audio_after_ms >= 5_000),
            (
                "audio.silent_rms",
                self.audio.silent_rms.is_finite() && self.audio.silent_rms >= 0.0,
            ),
            ("audio.level_interval_ms", self.audio.level_interval_ms >= 20),
            // H3 của kế hoạch 00 (spec 2026-10-10 §4–§5).
            (
                "streaming.min_partial_speech_ms",
                (250..=5_000).contains(&st.min_partial_speech_ms),
            ),
            ("streaming.min_new_speech_ms", st.min_new_speech_ms <= 2_000),
            ("streaming.end_silence_ms", (50..=2_000).contains(&st.end_silence_ms)),
            ("streaming.src_holdback_words", st.src_holdback_words <= 10),
            ("streaming.src_holdback_chars", st.src_holdback_chars <= 10),
            ("streaming.tgt_agree", st.tgt_agree.iter().all(LangAgree::is_valid)),
            ("streaming.tgt_agree", {
                let mut seen = std::collections::HashSet::new();
                st.tgt_agree
                    .iter()
                    .all(|a| Lang::from_code(&a.lang).is_some() && seen.insert(a.lang.as_str()))
            }),
            ("streaming.tgt_agree_fallback", st.tgt_agree_fallback.is_valid()),
            ("streaming.cycle_window", (1..=32).contains(&st.cycle_window)),
            ("streaming.cadence_factor", (1.0..=4.0).contains(&st.cadence_factor)),
            ("streaming.min_cadence_ms", st.min_cadence_ms >= 200),
            (
                "streaming.max_cadence_ms",
                st.max_cadence_ms >= st.min_cadence_ms && st.max_cadence_ms <= 10_000,
            ),
            (
                "streaming.initial_cadence_ms",
                (st.min_cadence_ms..=st.max_cadence_ms).contains(&st.initial_cadence_ms),
            ),
            ("streaming.warmup_cycles", st.warmup_cycles <= st.cycle_window),
            (
                "streaming.auto_off_cycle_ms",
                (200..=st.max_cadence_ms).contains(&st.auto_off_cycle_ms),
            ),
        ];
        match checks.iter().find(|(_, ok)| !ok) {
            Some((key, _)) => Err(key.to_string()),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Ghim số đã chốt ở spec: đổi mặc định mà không sửa spec thì test đỏ.
    #[test]
    fn defaults_are_the_numbers_of_the_spec() {
        let c = PipelineConfig::default();
        let s = &c.segmenter;
        assert_eq!(
            (
                s.threshold,
                s.min_speech_ms,
                s.end_silence_ms,
                s.max_segment_ms,
                s.force_cut_window_ms,
                s.pad_ms
            ),
            (0.5, 250, 300, 8_000, 1_500, 200)
        );
        let m = &c.merge;
        assert_eq!(
            (m.window_min_ms, m.window_extra_ms, m.max_speech_ms, m.max_segments),
            (700, 400, 15_000, 3)
        );
        let f = &c.filter;
        assert_eq!((f.no_speech_prob_max, f.avg_logprob_min), (0.6, -1.0));
        assert_eq!(
            (
                f.filler_logprob_max,
                f.filler_vad_prob_max,
                f.filler_long_ms,
                f.filler_long_max_words,
                f.compression_ratio_max
            ),
            (-0.7, 0.7, 2_000, 1, 2.4)
        );
        assert!(c.filter.simplify_chinese);
        assert_eq!((c.asr.max_prompt_tokens, c.asr.timeout_ms), (100, 30_000));
        let t = &c.mt;
        assert_eq!((t.repeat_penalty, t.retry_repeat_penalty), (1.05, 1.15));
        assert_eq!(
            (t.max_tokens_for(0), t.max_tokens_for(10), t.max_tokens_for(120)),
            (32, 72, 512)
        );
        assert_eq!((t.ratio_min_source_tokens, t.stop_grace_ms), (10, 3_000));
        assert_eq!(t.ratio_for("en", "vi"), Some(4.4));
        assert_eq!(t.ratio_for("zh", "vi"), Some(4.3));
        assert_eq!(t.ratio_for("vi", "en"), Some(1.4));
        assert_eq!(t.ratio_for("vi", "zh"), Some(1.2));
        assert_eq!(
            t.ratio_thresholds.len(),
            20,
            "8 chiều có tiếng Việt và 12 chiều không có"
        );
        assert_eq!(
            t.ratio_for("vi", "vi"),
            None,
            "cặp không có trong danh sách thì không có ngưỡng"
        );
        let q = &c.queue;
        assert_eq!(
            (
                q.asr_max_waiting,
                q.asr_merge_max_ms,
                q.asr_drop_after_ms,
                q.lag_warn_ms
            ),
            (3, 12_000, 20_000, 6_000)
        );
        assert_eq!((q.mt_max_waiting, q.mt_skip_after_ms), (3, 20_000));
        let v = &c.supervisor;
        assert_eq!(v.backoff_ms, [1_000, 2_000, 5_000]);
        assert_eq!(
            (v.max_failures, v.failure_window_ms, v.gpu_failures_to_cpu),
            (5, 600_000, 2)
        );
        assert_eq!(v.idle_shutdown_ms, 600_000);
        assert!(v.first_run_ready_timeout_ms >= 30_000);
        assert_eq!(c.audio.no_audio_after_ms, 60_000);
        assert_eq!(c.validate(), Ok(()));
    }

    /// Điểm cần quyết 4 của 02a: ngưỡng cho 12 chiều không có tiếng Việt lấy ở mục "Đề xuất" của
    /// `bench/phase0/results/gd1_mt_ratio.md` (Đ12), số lớn hơn của Hy-MT2 Q8_0 và Q4_K_M.
    #[test]
    fn pairs_without_vietnamese_use_the_d12_thresholds() {
        let mt = MtConfig::default();
        let expected = [
            ("en", "ja", 3.3),
            ("en", "ko", 3.2),
            ("en", "zh", 2.0),
            ("ja", "en", 1.7),
            ("ja", "ko", 2.8),
            ("ja", "zh", 1.5),
            ("ko", "en", 1.9),
            ("ko", "ja", 2.0),
            ("ko", "zh", 1.3),
            ("zh", "en", 2.7),
            ("zh", "ja", 3.8),
            ("zh", "ko", 3.7),
        ];
        for (src, tgt, ratio) in expected {
            assert_eq!(mt.ratio_for(src, tgt), Some(ratio), "{src}->{tgt}");
        }
        // Mỗi cặp chỉ có một dòng, để `ratio_for` (lấy dòng đầu) không giấu dòng trùng.
        let mut pairs: Vec<_> = mt.ratio_thresholds.iter().map(|p| (&p.src, &p.tgt)).collect();
        pairs.sort();
        pairs.dedup();
        assert_eq!(pairs.len(), mt.ratio_thresholds.len());
        let mut pairs: Vec<_> = mt.ratio_thresholds_lmt.iter().map(|p| (&p.src, &p.tgt)).collect();
        pairs.sort();
        pairs.dedup();
        assert_eq!(pairs.len(), mt.ratio_thresholds_lmt.len());
    }

    #[test]
    fn ratio_thresholds_follow_the_prompt_family() {
        let mut mt = MtConfig::default();
        assert_eq!(mt.prompt_family, PromptFamily::HyMt2);
        assert_eq!(mt.ratio_for("en", "vi"), Some(4.4));
        mt.prompt_family = PromptFamily::Lmt;
        mt.ratio_thresholds_lmt = vec![PairRatio {
            src: "en".into(),
            tgt: "vi".into(),
            ratio: 9.9,
        }];
        assert_eq!(mt.ratio_for("en", "vi"), Some(9.9));
        assert_eq!(
            mt.ratio_for("vi", "en"),
            None,
            "bảng LMT không có cặp này thì không kiểm tỉ lệ"
        );
    }

    #[test]
    fn the_prompt_family_never_comes_from_the_manifest() {
        let c: PipelineConfig =
            serde_json::from_value(serde_json::json!({ "mt": { "prompt_family": "Lmt" } })).unwrap();
        assert_eq!(c.mt.prompt_family, PromptFamily::HyMt2);
        assert!(serde_json::to_value(&c).unwrap()["mt"].get("prompt_family").is_none());
    }

    #[test]
    fn manifest_can_override_lmt_thresholds() {
        let c: PipelineConfig = serde_json::from_value(serde_json::json!({
            "mt": { "ratio_thresholds_lmt": [{ "src": "en", "tgt": "vi", "ratio": 5.0 }] }
        }))
        .unwrap();
        assert!(c.validate().is_ok());
        let mut mt = c.mt;
        mt.prompt_family = PromptFamily::Lmt;
        assert_eq!(mt.ratio_for("en", "vi"), Some(5.0));
        let bad: PipelineConfig = serde_json::from_value(serde_json::json!({
            "mt": { "ratio_thresholds_lmt": [{ "src": "en", "tgt": "vi", "ratio": -1.0 }] }
        }))
        .unwrap();
        assert_eq!(bad.validate(), Err("mt.ratio_thresholds_lmt".to_string()));
    }

    #[test]
    fn max_tokens_follow_spec_formula() {
        // §6.5: min(4 × số token câu gốc + 32, 512).
        let mt = MtConfig::default();
        assert_eq!(mt.max_tokens_for(0), 32);
        assert_eq!(mt.max_tokens_for(10), 72);
        assert_eq!(mt.max_tokens_for(119), 508);
        assert_eq!(mt.max_tokens_for(120), 512);
        assert_eq!(mt.max_tokens_for(121), 512);
        assert_eq!(mt.max_tokens_for(usize::MAX), 512);
    }

    /// Manifest chỉ ghi khóa muốn đổi: khóa thiếu lấy mặc định, khóa lạ bị bỏ qua.
    #[test]
    fn a_partial_manifest_keeps_the_other_defaults() {
        let json = r#"{
            "queue": { "lag_warn_ms": 8000 },
            "mt": { "ratio_thresholds": [{ "src": "en", "tgt": "zh", "ratio": 1.9 }] },
            "future_section": { "x": 1 }
        }"#;
        let c: PipelineConfig = serde_json::from_str(json).unwrap();
        assert_eq!(c.queue.lag_warn_ms, 8_000);
        assert_eq!(c.queue.mt_max_waiting, 3);
        assert_eq!(c.mt.ratio_for("en", "zh"), Some(1.9));
        assert_eq!(
            c.mt.ratio_for("en", "vi"),
            None,
            "danh sách trong manifest thay cả danh sách mặc định"
        );
        assert_eq!(c.segmenter, SegmenterConfig::default());
        assert_eq!(c.validate(), Ok(()));
    }

    #[test]
    fn out_of_range_values_name_the_key() {
        let mut c = PipelineConfig::default();
        c.supervisor.first_run_ready_timeout_ms = 20_000;
        assert_eq!(c.validate(), Err("supervisor.first_run_ready_timeout_ms".into()));
        let mut c = PipelineConfig::default();
        c.filter.no_speech_prob_max = 1.5;
        assert_eq!(c.validate(), Err("filter.no_speech_prob_max".into()));
        let mut c = PipelineConfig::default();
        c.supervisor.backoff_ms.clear();
        assert_eq!(c.validate(), Err("supervisor.backoff_ms".into()));
    }

    /// Biên của các giới hạn (N3 của review 02 lần 3): giá trị ngay ngoài biên bị từ chối, giá trị đúng ở biên thì nhận.
    #[test]
    fn bounds_are_exact() {
        type Set = fn(&mut PipelineConfig, bool);
        let cases: [(&str, Set); 7] = [
            ("supervisor.failure_window_ms", |c, ok| {
                c.supervisor.failure_window_ms = if ok { 60_000 } else { 59_999 }
            }),
            ("audio.no_audio_after_ms", |c, ok| {
                c.audio.no_audio_after_ms = if ok { 5_000 } else { 4_999 }
            }),
            ("queue.asr_merge_max_ms", |c, ok| {
                c.queue.asr_merge_max_ms = if ok { 30_000 } else { 30_001 }
            }),
            ("audio.silent_rms", |c, ok| {
                c.audio.silent_rms = if ok { 0.0 } else { -0.1 }
            }),
            ("asr.n_threads", |c, ok| c.asr.n_threads = if ok { 64 } else { 65 }),
            ("queue.mt_skip_after_ms", |c, ok| {
                c.queue.mt_skip_after_ms = if ok { 1_000 } else { 999 }
            }),
            ("merge.window_extra_ms", |c, ok| {
                c.merge.window_extra_ms = if ok { 5_000 } else { 5_001 }
            }),
        ];
        for (key, set) in cases {
            let mut c = PipelineConfig::default();
            set(&mut c, false);
            assert_eq!(c.validate(), Err(key.to_string()), "{key} ngoài biên");
            let mut c = PipelineConfig::default();
            set(&mut c, true);
            assert_eq!(c.validate(), Ok(()), "{key} đúng ở biên");
        }
    }

    /// Ghim số của chế độ dịch trong lúc nói (spec 2026-10-10 §4–§5, H3 của kế hoạch 00). Các số đã chốt ở cổng của kế
    /// hoạch 02 ngày 2026-10-12 (`bench/2026-10-10-do-tre/results/buoc2-cong.md`): đổi mặc định mà không sửa spec thì
    /// test này đỏ.
    #[test]
    fn streaming_defaults_are_the_numbers_of_the_spec() {
        let s = StreamingConfig::default();
        // QĐ4, chốt ở cổng của kế hoạch 02 (`bench/2026-10-10-do-tre/results/buoc2-cong.md`).
        assert_eq!(
            (s.min_partial_speech_ms, s.min_new_speech_ms, s.end_silence_ms),
            (1_000, 300, 50)
        );
        assert_eq!((s.src_holdback_words, s.src_holdback_chars), (1, 2));
        let agree: Vec<(&str, usize, usize)> = s.tgt_agree.iter().map(|a| (a.lang.as_str(), a.n, a.k)).collect();
        assert_eq!(
            agree,
            [("en", 2, 1), ("vi", 2, 1), ("zh", 2, 2), ("ja", 3, 2), ("ko", 3, 2)]
        );
        assert_eq!(
            (
                s.tgt_agree_fallback.lang.as_str(),
                s.tgt_agree_fallback.n,
                s.tgt_agree_fallback.k
            ),
            ("", 2, 1)
        );
        assert_eq!((s.cycle_window, s.cadence_factor), (8, 1.5));
        assert_eq!(
            (s.min_cadence_ms, s.max_cadence_ms, s.initial_cadence_ms),
            (700, 2_000, 1_000)
        );
        assert_eq!((s.warmup_cycles, s.auto_off_cycle_ms), (3, 1_300));
        assert_eq!(PipelineConfig::default().streaming, s);
        assert_eq!(PipelineConfig::default().validate(), Ok(()));
    }

    #[test]
    fn agreement_follows_the_source_language_with_a_fallback() {
        let s = StreamingConfig::default();
        assert_eq!(s.agree_for("en"), (2, 1));
        assert_eq!(s.agree_for("zh"), (2, 2));
        assert_eq!(s.agree_for("ko"), (3, 2));
        assert_eq!(s.agree_for("fr"), (2, 1), "tiếng lạ dùng giá trị dự phòng");
        assert_eq!(s.agree_for(""), (2, 1));
    }

    /// Manifest đổi được các khóa của `streaming`; danh sách `tgt_agree` mới thay cả danh sách mặc định.
    #[test]
    fn a_manifest_can_change_the_streaming_keys() {
        let json = r#"{ "streaming": { "end_silence_ms": 200, "tgt_agree": [{ "lang": "ja", "n": 3, "k": 3 }] } }"#;
        let c: PipelineConfig = serde_json::from_str(json).unwrap();
        assert_eq!(c.streaming.end_silence_ms, 200);
        assert_eq!(c.streaming.agree_for("ja"), (3, 3));
        assert_eq!(
            c.streaming.agree_for("en"),
            (2, 1),
            "không còn trong danh sách: dự phòng"
        );
        assert_eq!(c.streaming.min_partial_speech_ms, 1_000, "khóa thiếu giữ mặc định");
        assert_eq!(c.validate(), Ok(()));
    }

    /// Mỗi khóa của `streaming` báo đúng tên khi sai (bảng của H3), và nhận giá trị đúng ở biên.
    #[test]
    fn streaming_keys_are_checked() {
        type Set = fn(&mut StreamingConfig, bool);
        let cases: [(&str, Set); 16] = [
            ("streaming.min_partial_speech_ms", |s, ok| {
                s.min_partial_speech_ms = if ok { 250 } else { 249 }
            }),
            ("streaming.min_partial_speech_ms", |s, ok| {
                s.min_partial_speech_ms = if ok { 5_000 } else { 5_001 }
            }),
            ("streaming.min_new_speech_ms", |s, ok| {
                s.min_new_speech_ms = if ok { 2_000 } else { 2_001 }
            }),
            ("streaming.end_silence_ms", |s, ok| {
                s.end_silence_ms = if ok { 50 } else { 49 }
            }),
            ("streaming.end_silence_ms", |s, ok| {
                s.end_silence_ms = if ok { 2_000 } else { 2_001 }
            }),
            ("streaming.src_holdback_words", |s, ok| {
                s.src_holdback_words = if ok { 10 } else { 11 }
            }),
            ("streaming.src_holdback_chars", |s, ok| {
                s.src_holdback_chars = if ok { 10 } else { 11 }
            }),
            ("streaming.tgt_agree", |s, ok| s.tgt_agree[0].n = if ok { 5 } else { 1 }),
            ("streaming.tgt_agree", |s, ok| {
                s.tgt_agree[2].k = if ok { 10 } else { 11 }
            }),
            ("streaming.tgt_agree_fallback", |s, ok| {
                s.tgt_agree_fallback.n = if ok { 2 } else { 6 }
            }),
            ("streaming.cycle_window", |s, ok| {
                s.cycle_window = if ok { 32 } else { 33 }
            }),
            ("streaming.cadence_factor", |s, ok| {
                s.cadence_factor = if ok { 4.0 } else { f32::NAN }
            }),
            ("streaming.min_cadence_ms", |s, ok| {
                s.min_cadence_ms = if ok { 200 } else { 199 }
            }),
            ("streaming.max_cadence_ms", |s, ok| {
                s.max_cadence_ms = if ok { 10_000 } else { 10_001 }
            }),
            ("streaming.initial_cadence_ms", |s, ok| {
                s.initial_cadence_ms = if ok { 2_000 } else { 2_001 }
            }),
            ("streaming.warmup_cycles", |s, ok| {
                s.warmup_cycles = if ok { 8 } else { 9 }
            }),
        ];
        for (key, set) in cases {
            let mut c = PipelineConfig::default();
            set(&mut c.streaming, false);
            assert_eq!(c.validate(), Err(key.to_string()), "{key} ngoài biên");
            let mut c = PipelineConfig::default();
            set(&mut c.streaming, true);
            assert_eq!(c.validate(), Ok(()), "{key} đúng ở biên");
        }
        let mut c = PipelineConfig::default();
        c.streaming.auto_off_cycle_ms = 199;
        assert_eq!(c.validate(), Err("streaming.auto_off_cycle_ms".into()));
        let mut c = PipelineConfig::default();
        c.streaming.max_cadence_ms = 600; // nhỏ hơn min_cadence_ms 700
        assert_eq!(c.validate(), Err("streaming.max_cadence_ms".into()));
        // I1 của rà soát sau Task 1: auto_off_cycle_ms > max_cadence_ms vẫn "hợp lệ riêng lẻ" nhưng vô nghĩa khi
        // ghép (nhịp bị kẹp dưới trung vị thật trước khi tự tắt kịp kích hoạt).
        let mut c = PipelineConfig::default();
        c.streaming.auto_off_cycle_ms = 2_001; // lớn hơn max_cadence_ms mặc định 2_000
        assert_eq!(c.validate(), Err("streaming.auto_off_cycle_ms".into()));
        let mut c = PipelineConfig::default();
        c.streaming.auto_off_cycle_ms = 2_000; // bằng max_cadence_ms: còn hợp lệ
        assert_eq!(c.validate(), Ok(()));
    }

    /// I2 của rà soát sau Task 1: `tgt_agree` qua manifest thay cả danh sách, nên mã tiếng sai chính tả hay trùng
    /// nhau phải bị `validate` bắt — nếu không sẽ lặng lẽ rơi về `tgt_agree_fallback` (mức kém thận trọng nhất).
    #[test]
    fn tgt_agree_lang_must_be_a_known_code_and_unique() {
        // (a) Mặc định vẫn hợp lệ: 5 mã của `Lang::from_code`, không trùng nhau.
        assert_eq!(PipelineConfig::default().validate(), Ok(()));

        // (b) Mã tiếng không thuộc 5 mã hợp lệ (ví dụ lỗi chính tả "JA", "zh-CN") phải bị chặn.
        let mut c = PipelineConfig::default();
        c.streaming.tgt_agree[0].lang = "xx".into();
        assert_eq!(c.validate(), Err("streaming.tgt_agree".into()), "mã tiếng không hợp lệ");

        // (c) Hai mục cùng `lang` (ví dụ manifest ghi nhầm "ja" hai lần) phải bị chặn, dù mỗi mục riêng lẻ hợp lệ.
        let mut c = PipelineConfig::default();
        c.streaming.tgt_agree[0].lang = "ja".into(); // trùng với mục có sẵn ở tgt_agree[3]
        assert_eq!(c.validate(), Err("streaming.tgt_agree".into()), "trùng mã tiếng");

        // `tgt_agree_fallback.lang` cố ý rỗng (không phải mã tiếng thật) và không bị áp kiểm tra này.
        let mut c = PipelineConfig::default();
        c.streaming.tgt_agree_fallback.lang = "bất kỳ chuỗi nào, kể cả rỗng".into();
        assert_eq!(c.validate(), Ok(()));
    }

    /// Mỗi khóa có giới hạn đều báo đúng tên khi sai, kể cả các khóa thêm sau review.
    #[test]
    fn every_bounded_key_is_checked() {
        type Break = fn(&mut PipelineConfig);
        let cases: [(&str, Break); 19] = [
            ("filter.filler_logprob_max", |c| c.filter.filler_logprob_max = 0.5),
            ("filter.filler_vad_prob_max", |c| {
                c.filter.filler_vad_prob_max = f32::NAN
            }),
            ("filter.compression_ratio_max", |c| c.filter.compression_ratio_max = 0.0),
            ("queue.asr_merge_max_ms", |c| c.queue.asr_merge_max_ms = 0),
            ("supervisor.idle_shutdown_ms", |c| c.supervisor.idle_shutdown_ms = 0),
            ("supervisor.ready_timeout_ms", |c| c.supervisor.ready_timeout_ms = 0),
            ("mt.request_timeout_ms", |c| c.mt.request_timeout_ms = 0),
            ("mt.stop_grace_ms", |c| c.mt.stop_grace_ms = 600_000),
            ("audio.silent_rms", |c| c.audio.silent_rms = f32::NAN),
            ("merge.window_min_ms", |c| c.merge.window_min_ms = 0),
            ("mt.ratio_thresholds", |c| {
                c.mt.ratio_thresholds[0].ratio = f32::INFINITY
            }),
            // Chặn dưới thêm ở review 02 lần 2.
            ("queue.mt_skip_after_ms", |c| c.queue.mt_skip_after_ms = 0),
            ("queue.asr_drop_after_ms", |c| c.queue.asr_drop_after_ms = 0),
            ("audio.no_audio_after_ms", |c| c.audio.no_audio_after_ms = 0),
            ("supervisor.failure_window_ms", |c| c.supervisor.failure_window_ms = 0),
            ("asr.n_threads", |c| c.asr.n_threads = 0),
            ("mt.max_tokens_per_source_token", |c| {
                c.mt.max_tokens_per_source_token = 0
            }),
            ("supervisor.shutdown_grace_ms", |c| c.supervisor.shutdown_grace_ms = 0),
            ("merge.window_extra_ms", |c| c.merge.window_extra_ms = 0),
        ];
        for (key, f) in cases {
            let mut c = PipelineConfig::default();
            f(&mut c);
            assert_eq!(c.validate(), Err(key.to_string()), "{key}");
        }
    }
}
