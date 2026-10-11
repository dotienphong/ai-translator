//! Cổng tất định của flash attention (spec 2026-10-10 §8, A5; spec §6.4 "Flash attention"): cùng một đoạn, chép sau các
//! đoạn khác nhau (dài ngắn khác nhau nên `audio_ctx` khác nhau), phải ra cùng kết quả — chữ, token, `no_speech_prob`,
//! `avg_logprob`, ngôn ngữ và xác suất ngôn ngữ (`Transcribed`, so bit-for-bit vì whisper.cpp giải mã tất định). Chạy
//! worker hai lần, flash attention bật (`ASR_FLASH_ATTN=1`) rồi tắt (`=0`); cả hai lần phải tất định. In thêm số đoạn mà
//! hai lần cho cùng token (bật so tắt), để ghi vào biên bản (không phải điều kiện của cổng: chất lượng do A4 quyết định).
//!
//! Cần model thật và bản build Metal nên bị bỏ qua mặc định. Chạy từ gốc repo, với từng model:
//!
//! ```text
//! WHISPER_TEST_MODEL=models/ggml-large-v3-turbo-q5_0.bin cargo test --release -p asr-worker \
//!   --features metal,shared-encode --test flash_attn_determinism -- --include-ignored --nocapture
//! ```

use asr_protocol::{
    Backend, DecodeMode, Request, Response, TranscribeRequest, audio_ctx_for_samples, read_frame, write_frame,
};
use std::io::{BufReader, BufWriter};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

/// Các đoạn cắt từ `tests/fixtures/audio/fleurs-en-en-vi.wav` (19,08 giây; câu ở 1,00–4,96, 6,46–10,84 và 12,34–17,58
/// giây): (tên, từ ms, tới ms). `audio_ctx` lần lượt là 512, 768 (công thức cũ 614), 1024 (cũ 1018), 768 (cũ 718), 512.
const CUTS: [(&str, u64, u64); 5] = [
    ("a-4s", 800, 5_200),
    ("b-11s", 0, 11_000),
    ("c-19s", 0, 19_080),
    ("d-13s", 6_000, 19_080),
    ("e-6s-vi", 12_000, 17_800),
];
/// Thứ tự chép: mỗi đoạn đứng sau nhiều đoạn khác nhau, dài hơn và ngắn hơn nó.
const ORDER: [usize; 12] = [1, 0, 2, 1, 3, 1, 4, 2, 0, 3, 2, 4];

/// Mẫu của file WAV PCM 16-bit mono (chunk `data`).
fn read_wav(path: &Path) -> Vec<i16> {
    let bytes = std::fs::read(path).unwrap();
    assert_eq!(&bytes[..4], b"RIFF");
    let mut at = 12;
    while at + 8 <= bytes.len() {
        let size = u32::from_le_bytes(bytes[at + 4..at + 8].try_into().unwrap()) as usize;
        if &bytes[at..at + 4] == b"data" {
            return bytes[at + 8..at + 8 + size]
                .as_chunks::<2>()
                .0
                .iter()
                .map(|&b| i16::from_le_bytes(b))
                .collect();
        }
        at += 8 + size + size % 2;
    }
    panic!("{} không có chunk data", path.display());
}

struct Worker {
    child: Child,
    input: BufWriter<ChildStdin>,
    output: BufReader<ChildStdout>,
}

impl Worker {
    fn start(model: &str, flash_attn: &str) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_asr-worker"))
            .env("ASR_FLASH_ATTN", flash_attn)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let mut worker = Self {
            input: BufWriter::new(child.stdin.take().unwrap()),
            output: BufReader::new(child.stdout.take().unwrap()),
            child,
        };
        let load = Request::Load {
            model_path: model.into(),
            use_gpu: true,
            n_threads: 4,
        };
        match worker.call(&load) {
            Response::Ready {
                backend, decode_mode, ..
            } => {
                // Cổng tất định chỉ có ý nghĩa khi đo đúng thứ cần đo: Metal (flash attention của whisper.cpp là tính
                // năng của backend GGML trên GPU) và chế độ chia sẻ encoder (bản phát hành chỉ dùng `Shared`). Build
                // thiếu `--features metal` hay chạy CPU sẽ lặng lẽ đo sai thứ, nên panic rõ ràng ngay đây thay vì để
                // cổng "qua" trên dữ liệu không đại diện.
                assert_eq!(
                    backend,
                    Backend::Metal,
                    "cổng tất định cần chạy Metal, worker lại báo {backend:?}"
                );
                assert_eq!(
                    decode_mode,
                    DecodeMode::Shared,
                    "cổng tất định cần chế độ chia sẻ encoder (shared-encode), worker lại báo {decode_mode:?}"
                );
            }
            other => panic!("Load: {other:?}"),
        }
        assert!(matches!(worker.call(&Request::Warmup), Response::WarmupDone { .. }));
        worker
    }

    fn call(&mut self, req: &Request) -> Response {
        write_frame(&mut self.input, req).unwrap();
        read_frame::<_, Response>(&mut self.output).unwrap().unwrap()
    }

    /// Mọi trường của `TranscribeResult` mà pipeline thật dùng để quyết định hành vi, không chỉ chữ/token: bộ lọc giữ/bỏ
    /// đoạn (spec §6.4, "Lọc lỗi ảo giác") đọc `no_speech_prob` và `avg_logprob`; nhận diện ngôn ngữ đọc `lang` và
    /// `lang_prob`. Không có prompt hay ngôn ngữ của đoạn trước: chỉ trạng thái bên trong whisper.cpp nối các lần chép
    /// với nhau.
    fn transcribe(&mut self, id: u64, pcm: &[i16]) -> Transcribed {
        let req = TranscribeRequest {
            segment_id: id,
            pcm: pcm.to_vec(),
            languages: vec!["en".into(), "vi".into()],
            prompt_tokens: Vec::new(),
            audio_ctx: audio_ctx_for_samples(pcm.len()),
            prev_lang: None,
        };
        match self.call(&Request::Transcribe(req)) {
            Response::Result(r) => Transcribed {
                text: r.text,
                tokens: r.tokens,
                no_speech_prob: r.no_speech_prob,
                avg_logprob: r.avg_logprob,
                lang: r.lang,
                lang_prob: r.lang_prob,
            },
            other => panic!("đoạn {id}: {other:?}"),
        }
    }
}

/// Kết quả chép một đoạn, đủ các trường mà bộ lọc giữ/bỏ và nhận diện ngôn ngữ của pipeline thật dùng (xem
/// `Worker::transcribe`); không lấy `lid_ms`/`asr_ms` vì đó là thời gian chạy, luôn đổi giữa các lần dù tất định.
///
/// So bằng `#[derive(PartialEq)]`, tức `==` trực tiếp trên từng trường kể cả `f32`. Đây KHÔNG phải so sánh gần đúng:
/// không có lấy mẫu ngẫu nhiên nào trên đường này (chế độ B chọn token bằng argmax trong Rust, `shared.rs::pick_token`;
/// nhiệt độ 0). Với cùng trọng số model, cùng audio_ctx hiệu lực và cùng phần cứng/bản build, kernel Metal của ggml
/// chọn theo hình dạng tensor (cùng đoạn → cùng hình dạng → cùng kernel, cùng thứ tự cộng), nên phép tính phải tất
/// định tới từng bit `f32`. Hai lần chép ra khác bit nghĩa là cổng này đúng mục đích phải đỏ (ví dụ bug #3941 đọc đệm
/// K/V chưa ghi của đoạn trước).
#[derive(Debug, Clone, PartialEq)]
struct Transcribed {
    text: String,
    tokens: Vec<i32>,
    no_speech_prob: f32,
    avg_logprob: f32,
    lang: String,
    lang_prob: f32,
}

impl Drop for Worker {
    fn drop(&mut self) {
        let _ = write_frame(&mut self.input, &Request::Shutdown);
        let _ = self.child.wait();
    }
}

#[test]
#[ignore = "cần WHISPER_TEST_MODEL và bản build metal, shared-encode"]
fn the_same_segment_gives_the_same_tokens_whatever_came_before() {
    let model = std::env::var("WHISPER_TEST_MODEL").expect("đặt WHISPER_TEST_MODEL");
    let samples =
        read_wav(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/audio/fleurs-en-en-vi.wav"));
    let segments: Vec<(&str, Vec<i16>)> = CUTS
        .iter()
        .map(|&(name, from, to)| {
            let (a, b) = (from as usize * 16, (to as usize * 16).min(samples.len()));
            (name, samples[a..b].to_vec())
        })
        .collect();
    let ctx: Vec<i32> = segments
        .iter()
        .map(|(_, pcm)| audio_ctx_for_samples(pcm.len()))
        .collect();
    assert_eq!(ctx, [512, 768, 1024, 768, 512]);
    let mut by_mode = Vec::new();
    for flash_attn in ["1", "0"] {
        let mut worker = Worker::start(&model, flash_attn);
        let mut first: Vec<Option<Transcribed>> = vec![None; segments.len()];
        let mut differ = Vec::new();
        for (step, &i) in ORDER.iter().enumerate() {
            let got = worker.transcribe(step as u64, &segments[i].1);
            match &first[i] {
                None => first[i] = Some(got),
                // `Transcribed` so toàn bộ trường (chữ, token, no_speech_prob, avg_logprob, lang, lang_prob); in cả
                // hai bên bằng Debug để thấy ngay trường nào lệch, không chỉ chữ.
                Some(seen) if *seen != got => {
                    differ.push(format!("{} (bước {step}): {seen:?}\n  ≠ {got:?}", segments[i].0))
                }
                Some(_) => {}
            }
        }
        assert!(
            differ.is_empty(),
            "ASR_FLASH_ATTN={flash_attn}: cùng đoạn mà khác chữ/token/no_speech_prob/avg_logprob/lang/lang_prob:\n{}",
            differ.join("\n")
        );
        by_mode.push(first.into_iter().map(Option::unwrap).collect::<Vec<_>>());
    }
    let same = (0..segments.len())
        .filter(|&i| by_mode[0][i].tokens == by_mode[1][i].tokens)
        .count();
    println!(
        "flash attention bật và tắt cho cùng token ở {same}/{} đoạn",
        segments.len()
    );
    for (i, (name, _)) in segments.iter().enumerate() {
        if by_mode[0][i].tokens != by_mode[1][i].tokens {
            println!("  {name}: bật {:?} | tắt {:?}", by_mode[0][i].text, by_mode[1][i].text);
        }
    }
}
