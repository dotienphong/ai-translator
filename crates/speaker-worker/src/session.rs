//! Trạng thái của `speaker-worker` trong một lần chạy (spec 2026-10-26-phan-biet-nguoi-noi §4.1, §4.2, §5): nhận yêu cầu, trả
//! phản hồi. Không I/O: `main.rs` đọc và ghi khung, test gọi thẳng [`Worker::handle`] với bộ nhúng giả.
//!
//! - `Load`: kiểm cấu hình (sai thì dùng mặc định), nạp model; model hỏng thì `Ready { model_ok: false }`, worker vẫn sống.
//! - `SessionStart`: xóa mọi giọng.
//! - `Segment`: thời lượng cho phân cụm là `end_ms − start_ms` (thời lượng thật); worker nhúng PCM app gửi (tối đa
//!   `MAX_EMBED_SAMPLES`, A2 §5.2); đoạn ngắn hơn `min_embed_ms` hay PCM ít hơn `MIN_SAMPLES` mẫu thì không nhúng. Trả `Assign`,
//!   rồi `Merged` (nếu có), rồi `Voices` khi danh sách giọng (mã, cờ trong phòng) đổi.
//! - Nhúng và tâm giọng chỉ nằm trong RAM, mất khi `SessionStart` hay khi worker thoát (§5.6). Log (stderr) chỉ có số đếm,
//!   thời gian và loại lỗi; không có âm thanh hay tên người.

use std::collections::BTreeMap;
use std::path::Path;
use std::time::Instant;

use anyhow::Result;
use speaker_protocol::{
    ErrorKind, MAX_EMBED_SAMPLES, MAX_SEGMENT_MS, PROTOCOL_VERSION, Request, Response, SegmentAudio, Source,
    SpeakerConfig, VoiceInfo, f32_from_pcm,
};

use crate::cluster::OnlineClusterer;
use crate::embed::{Embedder, MIN_SAMPLES};

/// Phần trăm thời lượng từ micro để một giọng là giọng trong phòng (spec §5.5).
pub const ROOM_MIC_PERCENT: u64 = 60;

/// Bộ nhúng mà [`Worker`] dùng: `Embedder` thật, hay bản giả trong test.
pub trait Embed {
    fn embed(&self, samples: &[f32]) -> Result<Vec<f32>>;
}

impl Embed for Embedder {
    fn embed(&self, samples: &[f32]) -> Result<Vec<f32>> {
        Embedder::embed(self, samples)
    }
}

/// Thời lượng đã gán cho một giọng, và phần đến từ micro.
#[derive(Clone, Copy, Default)]
struct Tally {
    speech_ms: u64,
    mic_ms: u64,
}

impl Tally {
    fn room(&self) -> bool {
        self.speech_ms > 0 && self.mic_ms * 100 >= self.speech_ms * ROOM_MIC_PERCENT
    }
}

#[derive(Debug, PartialEq)]
pub enum Step {
    Reply(Vec<Response>),
    Exit,
}

/// Bộ nạp model: đường dẫn và SHA-256 app đã kiểm (`None`: không kiểm).
type Loader<E> = Box<dyn Fn(&Path, Option<&str>) -> Result<E>>;

pub struct Worker<E> {
    load: Loader<E>,
    embedder: Option<E>,
    config: SpeakerConfig,
    clusterer: OnlineClusterer,
    tally: BTreeMap<u32, Tally>,
    segments: u64,
    embedded: u64,
    embed_errors: u64,
    embed_ms: f64,
}

impl<E: Embed> Worker<E> {
    pub fn new(load: impl Fn(&Path, Option<&str>) -> Result<E> + 'static) -> Self {
        Self {
            load: Box::new(load),
            embedder: None,
            config: SpeakerConfig::default(),
            clusterer: OnlineClusterer::new(SpeakerConfig::default()),
            tally: BTreeMap::new(),
            segments: 0,
            embedded: 0,
            embed_errors: 0,
            embed_ms: 0.0,
        }
    }

    pub fn config(&self) -> &SpeakerConfig {
        &self.config
    }

    pub fn handle(&mut self, request: Request) -> Step {
        match request {
            Request::Load {
                model_path,
                model_sha256,
                config,
            } => Step::Reply(vec![self.load(&model_path, model_sha256.as_deref(), config)]),
            Request::SessionStart { .. } => {
                self.reset();
                Step::Reply(Vec::new())
            }
            Request::Segment(seg) => Step::Reply(self.segment(seg)),
            Request::Shutdown => Step::Exit,
        }
    }

    /// Một dòng cho log khi thoát: chỉ số đếm và thời gian.
    pub fn summary(&self) -> String {
        let avg = if self.embedded > 0 {
            self.embed_ms / self.embedded as f64
        } else {
            0.0
        };
        format!(
            "speaker-worker: {} đoạn, {} lần nhúng (lỗi {}), nhúng trung bình {avg:.1} ms, {} giọng còn sống",
            self.segments,
            self.embedded,
            self.embed_errors,
            self.clusterer.voice_count()
        )
    }

    fn load(&mut self, model_path: &str, model_sha256: Option<&str>, config: SpeakerConfig) -> Response {
        self.config = match config.validate() {
            Ok(()) => config,
            Err(field) => {
                eprintln!("speaker-worker: cấu hình nhận giọng sai ở `{field}`, dùng mặc định");
                SpeakerConfig::default()
            }
        };
        // Thả model cũ trước khi nạp model mới: RAM không giữ hai model cùng lúc.
        self.embedder = None;
        let t0 = Instant::now();
        self.embedder = match (self.load)(Path::new(model_path), model_sha256) {
            Ok(e) => {
                eprintln!("speaker-worker: nạp model xong trong {} ms", t0.elapsed().as_millis());
                Some(e)
            }
            Err(e) => {
                // Chỉ nguyên nhân gốc (không có đường dẫn, có thể chứa tên thư mục người dùng).
                eprintln!("speaker-worker: model nhúng giọng không dùng được: {}", e.root_cause());
                None
            }
        };
        self.reset();
        Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: self.embedder.is_some(),
        }
    }

    fn reset(&mut self) {
        self.clusterer = OnlineClusterer::new(self.config.clone());
        self.tally.clear();
    }

    /// Giọng đang sống kèm cờ trong phòng: thứ để so xem có phải gửi `Voices` không.
    fn voice_key(&self) -> Vec<(u32, bool)> {
        self.clusterer
            .voice_ids()
            .into_iter()
            .map(|v| (v, self.tally.get(&v).is_some_and(Tally::room)))
            .collect()
    }

    fn voices(&self) -> Vec<VoiceInfo> {
        self.clusterer
            .voice_ids()
            .into_iter()
            .map(|voice| {
                let t = self.tally.get(&voice).copied().unwrap_or_default();
                VoiceInfo {
                    voice,
                    speech_ms: t.speech_ms,
                    mic: t.room(),
                }
            })
            .collect()
    }

    fn segment(&mut self, seg: SegmentAudio) -> Vec<Response> {
        let error = |kind, message: &str| {
            vec![Response::Error {
                segment_id: Some(seg.segment_id),
                kind,
                message: message.into(),
            }]
        };
        if self.embedder.is_none() {
            return error(ErrorKind::NotLoaded, "chưa nạp model");
        }
        if seg.end_ms < seg.start_ms || seg.end_ms - seg.start_ms > MAX_SEGMENT_MS || seg.pcm.len() > MAX_EMBED_SAMPLES
        {
            return error(ErrorKind::InvalidRequest, "đoạn sai (thời lượng hay số mẫu)");
        }
        self.segments += 1;
        let duration = seg.end_ms - seg.start_ms;
        let embedding = if duration >= self.config.min_embed_ms && seg.pcm.len() >= MIN_SAMPLES {
            let t0 = Instant::now();
            let result = self.embedder.as_ref().map(|e| e.embed(&f32_from_pcm(&seg.pcm)));
            match result {
                Some(Ok(v)) => {
                    self.embedded += 1;
                    self.embed_ms += t0.elapsed().as_secs_f64() * 1000.0;
                    Some(v)
                }
                Some(Err(e)) => {
                    self.embed_errors += 1;
                    if self.embed_errors <= 3 {
                        eprintln!("speaker-worker: nhúng lỗi: {}", e.root_cause());
                    }
                    None
                }
                None => None,
            }
        } else {
            None
        };
        let before = self.voice_key();
        let a = self.clusterer.assign(duration, embedding.as_deref());
        for &(from, into) in &a.merged {
            if let Some(t) = self.tally.remove(&from) {
                let k = self.tally.entry(into).or_default();
                k.speech_ms = k.speech_ms.saturating_add(t.speech_ms);
                k.mic_ms = k.mic_ms.saturating_add(t.mic_ms);
            }
        }
        if let Some(v) = a.voice {
            let t = self.tally.entry(v).or_default();
            t.speech_ms = t.speech_ms.saturating_add(duration);
            if seg.source == Source::Mic {
                t.mic_ms = t.mic_ms.saturating_add(duration);
            }
        }
        let mut out = vec![Response::Assign {
            segment_id: seg.segment_id,
            voice: a.voice,
            confidence: a.confidence,
        }];
        out.extend(a.merged.iter().map(|&(from, into)| Response::Merged { from, into }));
        if self.voice_key() != before {
            out.push(Response::Voices { voices: self.voices() });
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    /// Bộ nhúng giả: dấu của mẫu đầu chọn vector (dương → A, âm → B, 0 → vector 0 không dùng được; PCM 7 → lỗi như đoạn không
    /// có đặc trưng); ghi số mẫu mỗi lần gọi.
    struct Fake(Arc<Mutex<Vec<usize>>>);

    impl Embed for Fake {
        fn embed(&self, samples: &[f32]) -> Result<Vec<f32>> {
            self.0.lock().unwrap().push(samples.len());
            if (samples[0] - 7.0 / i16::MAX as f32).abs() < 1e-6 {
                anyhow::bail!("đoạn không có đặc trưng");
            }
            Ok(match samples[0] {
                // Giá trị PCM 50: vector D, cosine 0,8 với A (test gộp).
                v if (v - 50.0 / i16::MAX as f32).abs() < 1e-6 => vec![0.8, 0.6, 0.0],
                v if v > 0.0 => vec![1.0, 0.0, 0.0],
                v if v < 0.0 => vec![0.0, 1.0, 0.0],
                _ => vec![0.0, 0.0, 0.0],
            })
        }
    }

    fn worker() -> (Worker<Fake>, Arc<Mutex<Vec<usize>>>) {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let c = calls.clone();
        let w = Worker::new(move |path: &Path, sha256: Option<&str>| {
            // `sai`: như bộ nạp thật khi byte đọc được khác SHA-256 app đã kiểm (`Embedder::load_checked`).
            if path.ends_with("hong.onnx") || sha256 == Some("sai") {
                anyhow::bail!("model hỏng")
            }
            Ok(Fake(c.clone()))
        });
        (w, calls)
    }

    fn load(w: &mut Worker<Fake>, path: &str, config: SpeakerConfig) -> Step {
        w.handle(Request::Load {
            model_path: path.into(),
            model_sha256: None,
            config,
        })
    }

    /// Đoạn `id` dài `ms` (thời lượng thật), PCM `pcm_len` mẫu toàn giá trị `value`.
    fn seg(id: u64, ms: u64, pcm_len: usize, value: i16, source: Source) -> Request {
        Request::Segment(SegmentAudio {
            segment_id: id,
            start_ms: 10_000,
            end_ms: 10_000 + ms,
            source,
            pcm: vec![value; pcm_len],
        })
    }

    fn replies(step: Step) -> Vec<Response> {
        match step {
            Step::Reply(r) => r,
            Step::Exit => panic!("không mong đợi Exit"),
        }
    }

    fn voices(list: &[(u32, bool)]) -> Response {
        Response::Voices {
            voices: list
                .iter()
                .map(|&(voice, mic)| VoiceInfo {
                    voice,
                    speech_ms: 0,
                    mic,
                })
                .collect(),
        }
    }

    /// So `Voices` bỏ qua `speech_ms` (thay đổi theo từng đoạn).
    fn strip(rs: Vec<Response>) -> Vec<Response> {
        rs.into_iter()
            .map(|r| match r {
                Response::Voices { voices } => Response::Voices {
                    voices: voices.into_iter().map(|v| VoiceInfo { speech_ms: 0, ..v }).collect(),
                },
                other => other,
            })
            .collect()
    }

    fn assign(id: u64, voice: Option<u32>, confidence: f32) -> Response {
        Response::Assign {
            segment_id: id,
            voice,
            confidence,
        }
    }

    #[test]
    fn load_reports_whether_the_model_is_usable() {
        let (mut w, _) = worker();
        let ready = |ok| {
            vec![Response::Ready {
                protocol_version: PROTOCOL_VERSION,
                model_ok: ok,
            }]
        };
        assert_eq!(
            replies(load(&mut w, "/m/hong.onnx", SpeakerConfig::default())),
            ready(false)
        );
        assert_eq!(
            replies(w.handle(seg(1, 2_000, 32_000, 100, Source::System))),
            [Response::Error {
                segment_id: Some(1),
                kind: ErrorKind::NotLoaded,
                message: "chưa nạp model".into()
            }]
        );
        assert_eq!(
            replies(load(&mut w, "/m/tot.onnx", SpeakerConfig::default())),
            ready(true)
        );
        // SHA-256 của `Load` tới bộ nạp; bộ nạp từ chối thì model không dùng được.
        let checked = Request::Load {
            model_path: "/m/tot.onnx".into(),
            model_sha256: Some("sai".into()),
            config: SpeakerConfig::default(),
        };
        assert_eq!(replies(w.handle(checked)), ready(false));
    }

    #[test]
    fn a_bad_config_falls_back_to_the_defaults() {
        let (mut w, _) = worker();
        let bad = SpeakerConfig {
            theta: f32::NAN,
            ..SpeakerConfig::default()
        };
        load(&mut w, "/m/tot.onnx", bad);
        assert_eq!(w.config(), &SpeakerConfig::default());
        let good = SpeakerConfig {
            theta: 0.5,
            ..SpeakerConfig::default()
        };
        load(&mut w, "/m/tot.onnx", good.clone());
        assert_eq!(w.config(), &good);
    }

    /// A2 (spec §5.2): chỉ nhúng tối đa 4 s đầu; thời lượng cho phân cụm là `end_ms − start_ms`, không phải số mẫu PCM.
    #[test]
    fn only_four_seconds_are_embedded_but_the_real_duration_clusters() {
        let (mut w, calls) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        // PCM 0,6 s nhưng đoạn thật dài 1,0 s: dưới `min_new_ms` (1,5 s) nên chưa mở giọng.
        assert_eq!(
            strip(replies(w.handle(seg(0, 1_000, 9_600, 100, Source::System)))),
            [assign(0, None, 0.0)]
        );
        // Cùng PCM nhưng đoạn thật dài 2,0 s: mở giọng 1.
        assert_eq!(
            strip(replies(w.handle(seg(1, 2_000, 9_600, 100, Source::System)))),
            [assign(1, Some(1), 1.0), voices(&[(1, false)])]
        );
        // Đoạn 6 s: app chỉ gửi 4 s đầu, worker nhúng đúng 4 s.
        replies(w.handle(seg(2, 6_000, MAX_EMBED_SAMPLES, 100, Source::System)));
        assert_eq!(*calls.lock().unwrap(), [9_600, 9_600, MAX_EMBED_SAMPLES]);
        // PCM dài hơn 4 s là lỗi của app.
        assert!(matches!(
            replies(w.handle(seg(3, 6_000, MAX_EMBED_SAMPLES + 1, 100, Source::System)))[..],
            [Response::Error {
                kind: ErrorKind::InvalidRequest,
                ..
            }]
        ));
    }

    #[test]
    fn short_segments_are_not_embedded_and_take_the_previous_voice() {
        let (mut w, calls) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)));
        // 0,4 s < `min_embed_ms`: không gọi nhúng, lấy giọng trước, độ tin 0.
        assert_eq!(
            strip(replies(w.handle(seg(1, 400, 6_400, -100, Source::System)))),
            [assign(1, Some(1), 0.0)]
        );
        // 0,6 s nhưng PCM thiếu (dưới `MIN_SAMPLES`): cũng không nhúng.
        assert_eq!(
            strip(replies(w.handle(seg(2, 600, 7_000, -100, Source::System)))),
            [assign(2, Some(1), 0.0)]
        );
        assert_eq!(calls.lock().unwrap().len(), 1);
    }

    /// `Assign` trước, rồi `Voices` khi danh sách giọng đổi; không đổi thì chỉ `Assign`.
    #[test]
    fn voices_are_sent_only_when_the_list_changes() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        assert_eq!(
            strip(replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)))),
            [assign(0, Some(1), 1.0), voices(&[(1, false)])]
        );
        assert_eq!(
            strip(replies(w.handle(seg(1, 2_000, 32_000, -100, Source::System)))),
            [assign(1, Some(2), 1.0), voices(&[(1, false), (2, false)])]
        );
        assert_eq!(
            strip(replies(w.handle(seg(2, 2_000, 32_000, 100, Source::System)))),
            [assign(2, Some(1), 1.0)]
        );
    }

    #[test]
    fn an_unusable_embedding_opens_no_voice() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        assert_eq!(
            strip(replies(w.handle(seg(0, 2_000, 32_000, 0, Source::System)))),
            [assign(0, None, 0.0)]
        );
    }

    /// Nhúng lỗi (như đoạn im lặng, tiếng ù: `Embedder::embed` từ chối đoạn không có đặc trưng) không mở giọng: đoạn lấy giọng
    /// trước với độ tin 0, như đoạn quá ngắn; lỗi được đếm trong tóm tắt.
    #[test]
    fn an_embedding_error_opens_no_voice_and_takes_the_previous_voice() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        // Chưa có giọng nào: không có giọng để lấy.
        assert_eq!(
            strip(replies(w.handle(seg(0, 2_000, 32_000, 7, Source::System)))),
            [assign(0, None, 0.0)]
        );
        replies(w.handle(seg(1, 2_000, 32_000, 100, Source::System)));
        assert_eq!(
            strip(replies(w.handle(seg(2, 2_000, 32_000, 7, Source::System)))),
            [assign(2, Some(1), 0.0)]
        );
        let s = w.summary();
        assert!(
            s.contains("1 lần nhúng (lỗi 2)") && s.contains("1 giọng còn sống"),
            "{s}"
        );
    }

    /// `Load` lần hai thả model cũ trước khi nạp model mới, để RAM không giữ hai model cùng lúc.
    #[test]
    fn a_second_load_drops_the_old_model_first() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct Counted(Arc<AtomicUsize>);
        impl Embed for Counted {
            fn embed(&self, _: &[f32]) -> Result<Vec<f32>> {
                Ok(vec![1.0, 0.0, 0.0])
            }
        }
        impl Drop for Counted {
            fn drop(&mut self) {
                self.0.fetch_sub(1, Ordering::SeqCst);
            }
        }

        let alive = Arc::new(AtomicUsize::new(0));
        let seen = Arc::new(Mutex::new(Vec::new()));
        let (a, s) = (alive.clone(), seen.clone());
        let mut w = Worker::new(move |_: &Path, _: Option<&str>| {
            s.lock().unwrap().push(a.load(Ordering::SeqCst));
            a.fetch_add(1, Ordering::SeqCst);
            Ok(Counted(a.clone()))
        });
        for _ in 0..3 {
            w.handle(Request::Load {
                model_path: "/m/tot.onnx".into(),
                model_sha256: None,
                config: SpeakerConfig::default(),
            });
        }
        // Mỗi lần bộ nạp chạy, không còn model nào sống; sau cùng chỉ còn model mới nhất.
        assert_eq!(*seen.lock().unwrap(), [0, 0, 0]);
        assert_eq!(alive.load(Ordering::SeqCst), 1);
        drop(w);
        assert_eq!(alive.load(Ordering::SeqCst), 0);
    }

    /// Giọng có ≥ 60% thời lượng từ micro là giọng trong phòng (spec §5.5); cờ đổi thì gửi lại `Voices`.
    #[test]
    fn a_voice_mostly_from_the_mic_is_in_the_room() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        assert_eq!(
            strip(replies(w.handle(seg(0, 2_000, 32_000, 100, Source::Mic)))),
            [assign(0, Some(1), 1.0), voices(&[(1, true)])]
        );
        // 2 s micro, rồi 2 s âm thanh máy: 50% < 60%, không còn là giọng trong phòng.
        let r = strip(replies(w.handle(seg(1, 2_000, 32_000, 100, Source::System))));
        assert_eq!(r[1], voices(&[(1, false)]));
        // `Mixed` không tính là micro.
        let r = strip(replies(w.handle(seg(2, 2_000, 32_000, 100, Source::Mixed))));
        assert_eq!(r.len(), 1, "{r:?}");
    }

    /// Gộp (mặc định tắt, bật lại được qua `speaker_config`): `merged` của bộ phân cụm thành `Merged`, thời lượng cộng sang giọng
    /// giữ lại. A = (1,0,0), D = (0,8; 0,6; 0): cosine 0,8. θ 0,9 nên D mở giọng 2; gộp 0,7 khi cả hai ≥ 3 s nên giọng 2 gộp
    /// ngay vào giọng 1 (bằng thời lượng thì giữ giọng mở trước), mã của chính đoạn đổi theo thành 1. Danh sách giọng trước và sau
    /// đều là [1] nên không có `Voices`; app bỏ giọng 2 nhờ `Merged`.
    #[test]
    fn merges_are_reported() {
        let (mut w, _) = worker();
        let config = SpeakerConfig {
            theta: 0.9,
            merge_theta: 0.7,
            merge_min_ms: 3_000,
            ..SpeakerConfig::default()
        };
        load(&mut w, "/m/tot.onnx", config);
        replies(w.handle(seg(0, 4_000, 32_000, 100, Source::System)));
        let r = strip(replies(w.handle(seg(1, 4_000, 32_000, 50, Source::System))));
        assert_eq!(r, [assign(1, Some(1), 1.0), Response::Merged { from: 2, into: 1 }]);
    }

    #[test]
    fn session_start_forgets_every_voice() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)));
        assert!(replies(w.handle(Request::SessionStart { unix_ms: 1 })).is_empty());
        // Giọng cũ đã xóa: đoạn ngắn đầu tiên không có giọng nào để lấy.
        assert_eq!(
            strip(replies(w.handle(seg(1, 400, 6_400, 100, Source::System)))),
            [assign(1, None, 0.0)]
        );
    }

    #[test]
    fn bad_segments_are_rejected_without_panicking() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        let reversed = Request::Segment(SegmentAudio {
            segment_id: 9,
            start_ms: 5_000,
            end_ms: 4_000,
            source: Source::System,
            pcm: vec![1; 100],
        });
        assert!(matches!(
            replies(w.handle(reversed))[..],
            [Response::Error {
                segment_id: Some(9),
                kind: ErrorKind::InvalidRequest,
                ..
            }]
        ));
        assert!(matches!(
            replies(w.handle(seg(10, MAX_SEGMENT_MS + 1, 100, 1, Source::System)))[..],
            [Response::Error {
                kind: ErrorKind::InvalidRequest,
                ..
            }]
        ));
        assert_eq!(w.handle(Request::Shutdown), Step::Exit);
    }

    #[test]
    fn the_summary_has_only_counts() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)));
        let s = w.summary();
        assert!(s.contains("1 đoạn") && s.contains("1 lần nhúng"), "{s}");
        assert!(!s.contains("100"), "không có mẫu âm thanh: {s}");
    }
}
