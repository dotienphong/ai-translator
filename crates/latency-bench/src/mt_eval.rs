//! A3 (Đ4 của kế hoạch 00): dịch bộ test bằng đúng code dịch của app (`pipeline::translate`: prompt, số token tối đa,
//! hậu xử lý trong lúc stream, thử lại một lần), ghi JSONL cùng định dạng với `bench/phase0/mt/translate.py` để
//! `score_mt.py` chấm.
//!
//! Kết quả: `<out-dir>/<tên model>-<plain|context>.jsonl`, cùng `<…>.meta.json` ghi điều kiện của lượt chạy: git HEAD (kèm
//! cờ có thay đổi chưa commit), tên và kích thước model, đường dẫn và kích thước `llama-server`, `MtConfig`, biến thể, bộ
//! test, cờ `--no-ratio-thresholds`. Chạy lại cùng `--out-dir` thì dịch
//! tiếp các câu chưa có, như `translate.py`, nhưng chỉ khi điều kiện y hệt lần trước (R6 của kế hoạch 00: tránh trộn
//! kết quả của hai phiên bản code hay hai model). Khác thì từ chối, trừ khi có `--resume-anyway`. Muốn dịch lại từ đầu
//! thì dùng thư mục khác (nhãn khác), đừng xóa kết quả mốc.

use anyhow::{Context, Result, bail};
use pipeline::config::MtConfig;
use pipeline::llama::{LlamaLaunch, LlamaServer};
use pipeline::prompt::Lang;
use pipeline::translate::{Job, Outcome, translate};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{BufRead, BufReader, Write};
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};

#[derive(clap::Args)]
pub struct MtEvalArgs {
    /// JSONL của `build_testset.py`: mỗi dòng có id, dir, src_lang, tgt_lang, src, context.
    #[arg(long)]
    testset: PathBuf,
    #[arg(long)]
    llama_server: PathBuf,
    #[arg(long)]
    model: PathBuf,
    /// Thư mục kết quả, ví dụ `bench/phase0/data/mt/outputs-gd1-mteval`. Không dùng `outputs/` (mốc của S7).
    #[arg(long)]
    out_dir: PathBuf,
    /// `plain`: không ngữ cảnh (cấu hình mặc định của app). `context`: cờ thử nghiệm ngữ cảnh câu trước.
    #[arg(long, default_value = "plain", value_parser = ["plain", "context"])]
    variant: String,
    /// Chỉ dịch N câu đầu của mỗi chiều (chạy thử). Áp trước khi lọc biến thể `context`, như `translate.py`.
    #[arg(long, default_value_t = 0)]
    limit: usize,
    /// Dịch tiếp file kết quả cũ dù điều kiện lần trước khác lần này (`<…>.meta.json`).
    #[arg(long)]
    resume_anyway: bool,
    /// Không kiểm ngưỡng tỉ lệ token (`ratio_thresholds` rỗng), chỉ giữ hạn mức sinh: để đo tỉ lệ khách quan. Mặc định
    /// dịch như app, nên bản dịch bị cắt ở ngưỡng mặc định (N4 của review cuối 02).
    #[arg(long)]
    no_ratio_thresholds: bool,
}

/// Cấu hình dịch của lượt chạy: như app, trừ khi `--no-ratio-thresholds`.
fn mt_config(args: &MtEvalArgs) -> MtConfig {
    let mut cfg = MtConfig::default();
    if args.no_ratio_thresholds {
        cfg.ratio_thresholds.clear();
    }
    cfg
}

/// Điều kiện của một lượt chạy, ghi cạnh file kết quả.
#[derive(Serialize, Deserialize, PartialEq, Debug)]
struct Meta {
    git_head: String,
    git_dirty: bool,
    model_file: String,
    model_bytes: u64,
    /// Bản `llama-server` (N-5 của review 02 lần 2): đổi bản llama.cpp thì không dịch tiếp vào file cũ.
    llama_server: String,
    llama_server_bytes: u64,
    variant: String,
    testset_file: String,
    testset_lines: usize,
    limit: usize,
    /// `--no-ratio-thresholds`. `meta.json` cũ không có trường này: lúc đó chưa có cờ, tức là chạy có ngưỡng.
    #[serde(default)]
    no_ratio_thresholds: bool,
    mt_config: serde_json::Value,
}

/// `git rev-parse HEAD` và `git status --porcelain` của repo chứa công cụ. Không có git thì là "không rõ".
fn git_state() -> (String, bool) {
    let git = |args: &[&str]| {
        std::process::Command::new("git")
            .args(args)
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    };
    let head = git(&["rev-parse", "HEAD"]).unwrap_or_else(|| "không rõ".into());
    let dirty = git(&["status", "--porcelain", "--untracked-files=no"]).is_some_and(|s| !s.is_empty());
    (head, dirty)
}

/// So điều kiện lần này với lần trước; trả các khóa khác nhau.
fn meta_diff(old: &Meta, new: &Meta) -> Vec<&'static str> {
    let mut keys = Vec::new();
    let pairs: [(&'static str, bool); 12] = [
        ("git_head", old.git_head == new.git_head),
        ("git_dirty", old.git_dirty == new.git_dirty),
        ("model_file", old.model_file == new.model_file),
        ("model_bytes", old.model_bytes == new.model_bytes),
        ("llama_server", old.llama_server == new.llama_server),
        ("llama_server_bytes", old.llama_server_bytes == new.llama_server_bytes),
        ("variant", old.variant == new.variant),
        ("testset_file", old.testset_file == new.testset_file),
        ("testset_lines", old.testset_lines == new.testset_lines),
        ("limit", old.limit == new.limit),
        (
            "no_ratio_thresholds",
            old.no_ratio_thresholds == new.no_ratio_thresholds,
        ),
        ("mt_config", old.mt_config == new.mt_config),
    ];
    for (key, same) in pairs {
        if !same {
            keys.push(key);
        }
    }
    keys
}

/// Ghi `meta` cạnh file kết quả; file kết quả đã có thì `meta` phải khớp lần trước (hoặc `resume_anyway`).
fn check_meta(meta_path: &Path, out_exists: bool, meta: &Meta, resume_anyway: bool) -> Result<()> {
    if out_exists {
        let old: Option<Meta> = std::fs::read(meta_path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok());
        let diff = match &old {
            Some(old) => meta_diff(old, meta),
            None => vec!["meta.json (không có hoặc hỏng)"],
        };
        if !diff.is_empty() && !resume_anyway {
            bail!(
                "{} có kết quả của một lượt chạy khác ({}): dùng --out-dir khác, hoặc --resume-anyway nếu chắc chắn",
                meta_path.display(),
                diff.join(", ")
            );
        }
        if !diff.is_empty() {
            println!("dịch tiếp dù khác lần trước: {}", diff.join(", "));
        }
    }
    std::fs::write(meta_path, serde_json::to_vec_pretty(meta)?)?;
    Ok(())
}

#[derive(Deserialize)]
struct Item {
    id: String,
    dir: String,
    src_lang: String,
    tgt_lang: String,
    src: String,
    #[serde(default)]
    context: Option<String>,
}

/// Một dòng kết quả. Các trường đầu giống `translate.py`; `status` và `attempts` là của app.
#[derive(Serialize)]
struct Row<'a> {
    id: &'a str,
    dir: &'a str,
    /// Bản dịch sau hậu xử lý; dịch lỗi thì là câu gốc, đúng như phụ đề app hiện ("chưa dịch được").
    hyp: String,
    src_tokens: usize,
    completion_tokens: usize,
    total_ms: f32,
    first_token_ms: Option<f32>,
    /// "stop" khi dịch xong; "failed" khi cả hai lần đều lỗi (không có "length": bản cụt bị coi là lỗi).
    finish_reason: &'static str,
    status: &'static str,
    attempts: u8,
    /// Chỉ có ở câu lỗi: lý do của lần thử cuối (lỗi gọi server, hay luật hậu xử lý nào chặn bản dịch).
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

/// Dòng kết quả của một câu. Hủy hay server không dùng được thì không phải kết quả của câu: dừng lần chạy.
fn to_row(item: &Item, outcome: Outcome) -> Result<Row<'_>> {
    Ok(match outcome {
        Outcome::Done(t) => Row {
            id: &item.id,
            dir: &item.dir,
            hyp: t.text,
            src_tokens: t.source_tokens,
            completion_tokens: t.completion_tokens.unwrap_or(0),
            total_ms: t.total_ms,
            first_token_ms: t.first_delta_ms,
            finish_reason: "stop",
            status: "done",
            attempts: t.attempts,
            reason: None,
        },
        Outcome::Failed {
            reason,
            source_tokens,
            completion_tokens,
            attempts,
        } => Row {
            id: &item.id,
            dir: &item.dir,
            hyp: item.src.clone(),
            src_tokens: source_tokens,
            completion_tokens: completion_tokens.unwrap_or(0),
            total_ms: 0.0,
            first_token_ms: None,
            finish_reason: "failed",
            status: "failed",
            attempts,
            reason: Some(reason),
        },
        other => bail!("câu {}: {other:?}", item.id),
    })
}

/// Các id đã có trong file kết quả. Dòng cuối viết dở (lần trước bị ngắt) thì cắt bỏ.
fn done_ids(path: &Path) -> Result<HashSet<String>> {
    if !path.exists() {
        return Ok(HashSet::new());
    }
    let data = std::fs::read(path)?;
    let keep = data.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
    if keep < data.len() {
        std::fs::write(path, &data[..keep])?;
    }
    #[derive(Deserialize)]
    struct Done {
        id: String,
    }
    BufReader::new(std::fs::File::open(path)?)
        .lines()
        .map(|l| Ok(serde_json::from_str::<Done>(&l?)?.id))
        .collect()
}

pub fn run(args: MtEvalArgs) -> Result<()> {
    std::fs::create_dir_all(&args.out_dir)?;
    let stem = args
        .model
        .file_stem()
        .context("--model phải là file .gguf")?
        .to_string_lossy()
        .into_owned();
    let out_path = args.out_dir.join(format!("{stem}-{}.jsonl", args.variant));
    let reader = BufReader::new(
        std::fs::File::open(&args.testset).with_context(|| format!("không mở được {}", args.testset.display()))?,
    );
    let mut items = Vec::new();
    let mut lines = 0;
    let mut per_dir = std::collections::HashMap::<String, usize>::new();
    for line in reader.lines() {
        let item: Item = serde_json::from_str(&line?)?;
        lines += 1;
        // Như `translate.py`: lấy N câu đầu của mỗi chiều trước, rồi mới lọc câu có ngữ cảnh.
        let n = per_dir.entry(item.dir.clone()).or_default();
        if args.limit > 0 && *n >= args.limit {
            continue;
        }
        *n += 1;
        if args.variant == "context" && item.context.as_deref().is_none_or(str::is_empty) {
            continue;
        }
        items.push(item);
    }
    let cfg = mt_config(&args);
    let (git_head, git_dirty) = git_state();
    let meta = Meta {
        git_head,
        git_dirty,
        model_file: format!("{stem}.gguf"),
        model_bytes: std::fs::metadata(&args.model)
            .with_context(|| format!("không đọc được {}", args.model.display()))?
            .len(),
        llama_server: args.llama_server.display().to_string(),
        llama_server_bytes: std::fs::metadata(&args.llama_server)
            .with_context(|| format!("không đọc được {}", args.llama_server.display()))?
            .len(),
        variant: args.variant.clone(),
        testset_file: args
            .testset
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        testset_lines: lines,
        limit: args.limit,
        no_ratio_thresholds: args.no_ratio_thresholds,
        mt_config: serde_json::to_value(&cfg)?,
    };
    let meta_path = args.out_dir.join(format!("{stem}-{}.meta.json", args.variant));
    check_meta(&meta_path, out_path.exists(), &meta, args.resume_anyway)?;
    let done = done_ids(&out_path)?;
    let todo: Vec<&Item> = items.iter().filter(|i| !done.contains(&i.id)).collect();
    println!(
        "{stem}-{}: {} câu, còn {} câu phải dịch",
        args.variant,
        items.len(),
        todo.len()
    );
    if todo.is_empty() {
        return Ok(());
    }
    let launch = LlamaLaunch {
        request_timeout: crate::latency::TOOL_REQUEST_TIMEOUT,
        ..LlamaLaunch::new(
            &args.llama_server,
            &args.model,
            &args.out_dir.join(format!("{stem}.llama.log")),
        )
    };
    let mut server = LlamaServer::spawn(&launch)?;
    let mut out = std::fs::OpenOptions::new().create(true).append(true).open(&out_path)?;
    for (n, item) in todo.iter().enumerate() {
        let (Some(src), Some(tgt)) = (Lang::from_code(&item.src_lang), Lang::from_code(&item.tgt_lang)) else {
            bail!("câu {}: cặp ngôn ngữ lạ {}→{}", item.id, item.src_lang, item.tgt_lang);
        };
        let job = Job {
            text: &item.src,
            src,
            tgt,
            context: if args.variant == "context" {
                item.context.as_deref()
            } else {
                None
            },
        };
        let row = to_row(
            item,
            translate(&mut server, &job, &cfg, &mut |_| ControlFlow::Continue(())),
        )?;
        writeln!(out, "{}", serde_json::to_string(&row)?)?;
        out.flush()?;
        if (n + 1) % 25 == 0 || n + 1 == todo.len() {
            println!("{stem}-{}: {}/{}", args.variant, n + 1, todo.len());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use pipeline::translate::Translated;

    #[test]
    fn a_half_written_last_line_is_cut_on_resume() {
        let dir = std::env::temp_dir().join(format!("mt-eval-resume-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("out.jsonl");
        std::fs::write(&path, "{\"id\":\"a\"}\n{\"id\":\"b\"}\n{\"id\":\"c\",\"hy").unwrap();
        let done = done_ids(&path).unwrap();
        assert_eq!(done, HashSet::from(["a".to_string(), "b".to_string()]));
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "{\"id\":\"a\"}\n{\"id\":\"b\"}\n"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn meta() -> Meta {
        Meta {
            git_head: "abc".into(),
            git_dirty: false,
            model_file: "m.gguf".into(),
            model_bytes: 10,
            llama_server: "/tools/llama-b11146/llama-server".into(),
            llama_server_bytes: 20,
            variant: "plain".into(),
            testset_file: "t.jsonl".into(),
            testset_lines: 620,
            limit: 0,
            no_ratio_thresholds: false,
            mt_config: serde_json::to_value(MtConfig::default()).unwrap(),
        }
    }

    fn item() -> Item {
        Item {
            id: "ja-en-378".into(),
            dir: "ja->en".into(),
            src_lang: "ja".into(),
            tgt_lang: "en".into(),
            src: "無料で".into(),
            context: None,
        }
    }

    /// Câu lỗi ghi lý do (ví dụ lỗi /tokenize ở e591a1e), để không phải dựng lại lỗi mới biết vì sao; câu dịch xong thì
    /// không có trường `reason`.
    #[test]
    fn a_failed_row_records_the_reason() {
        let item = item();
        let failed = Outcome::Failed {
            reason: "không gọi được llama-server /tokenize".into(),
            attempts: 0,
            source_tokens: 0,
            completion_tokens: None,
        };
        let json: serde_json::Value = serde_json::to_value(to_row(&item, failed).unwrap()).unwrap();
        assert_eq!(json["status"], "failed");
        assert_eq!(json["hyp"], "無料で");
        assert_eq!(json["reason"], "không gọi được llama-server /tokenize");
        let done = Outcome::Done(Translated {
            text: "Free".into(),
            attempts: 1,
            source_tokens: 3,
            completion_tokens: Some(1),
            first_delta_ms: Some(10.0),
            total_ms: 20.0,
        });
        let json: serde_json::Value = serde_json::to_value(to_row(&item, done).unwrap()).unwrap();
        assert_eq!(json["status"], "done");
        assert!(json.get("reason").is_none(), "{json}");
        assert!(to_row(&item, Outcome::Cancelled).is_err());
    }

    #[derive(clap::Parser)]
    struct Cli {
        #[command(flatten)]
        args: MtEvalArgs,
    }

    fn parse(extra: &[&str]) -> MtEvalArgs {
        let base = [
            "mt-eval",
            "--testset",
            "t.jsonl",
            "--llama-server",
            "s",
            "--model",
            "m.gguf",
            "--out-dir",
            "o",
        ];
        <Cli as clap::Parser>::try_parse_from(base.iter().chain(extra))
            .unwrap()
            .args
    }

    /// N4 của review cuối 02: `--no-ratio-thresholds` bỏ hết ngưỡng tỉ lệ token (đo tỉ lệ khách quan, không bị cắt ở
    /// ngưỡng mặc định); mọi tham số dịch khác giữ như app.
    #[test]
    fn no_ratio_thresholds_empties_only_the_thresholds() {
        let args = parse(&[]);
        assert!(!args.no_ratio_thresholds);
        assert_eq!(mt_config(&args), MtConfig::default());
        let args = parse(&["--no-ratio-thresholds"]);
        assert!(args.no_ratio_thresholds);
        let cfg = mt_config(&args);
        assert!(cfg.ratio_thresholds.is_empty());
        assert_eq!(cfg.ratio_for("ko", "zh"), None);
        assert_eq!(
            MtConfig {
                ratio_thresholds: MtConfig::default().ratio_thresholds,
                ..cfg
            },
            MtConfig::default(),
            "chỉ bỏ ngưỡng"
        );
    }

    /// N4 của review cuối 02: cờ được ghi trong `meta.json`, nên dịch tiếp không trộn kết quả có ngưỡng với không ngưỡng.
    /// `meta.json` cũ (trước khi có cờ) đọc ra là chạy có ngưỡng.
    #[test]
    fn resuming_does_not_mix_runs_with_and_without_thresholds() {
        let dir = std::env::temp_dir().join(format!("mt-eval-ratio-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("m-plain.meta.json");
        let json = serde_json::to_value(meta()).unwrap();
        assert_eq!(json["no_ratio_thresholds"], false);
        check_meta(&path, false, &meta(), false).unwrap();
        let unthresholded = Meta {
            no_ratio_thresholds: true,
            mt_config: serde_json::to_value(mt_config(&parse(&["--no-ratio-thresholds"]))).unwrap(),
            ..meta()
        };
        let err = check_meta(&path, true, &unthresholded, false).unwrap_err().to_string();
        assert!(err.contains("no_ratio_thresholds, mt_config"), "{err}");
        let mut old = json;
        old.as_object_mut().unwrap().remove("no_ratio_thresholds");
        std::fs::write(&path, serde_json::to_vec(&old).unwrap()).unwrap();
        check_meta(&path, true, &meta(), false).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Q7 của review 02b: dịch tiếp chỉ khi điều kiện y hệt lần trước.
    #[test]
    fn resuming_needs_the_same_conditions() {
        let dir = std::env::temp_dir().join(format!("mt-eval-meta-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("m-plain.meta.json");
        check_meta(&path, false, &meta(), false).unwrap();
        check_meta(&path, true, &meta(), false).unwrap();
        let cfg = MtConfig {
            repeat_penalty: 1.1,
            ..MtConfig::default()
        };
        let other = Meta {
            git_head: "def".into(),
            mt_config: serde_json::to_value(cfg).unwrap(),
            ..meta()
        };
        let err = check_meta(&path, true, &other, false).unwrap_err().to_string();
        assert!(err.contains("git_head, mt_config"), "{err}");
        let other_server = Meta {
            llama_server_bytes: 21,
            ..meta()
        };
        let err = check_meta(&path, true, &other_server, false).unwrap_err().to_string();
        assert!(err.contains("llama_server_bytes"), "đổi bản llama-server: {err}");
        assert_eq!(meta_diff(&meta(), &meta()), Vec::<&str>::new());
        check_meta(&path, true, &other, true).unwrap();
        let saved: Meta = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved, other, "--resume-anyway ghi điều kiện mới");
        std::fs::remove_file(&path).unwrap();
        let err = check_meta(&path, true, &meta(), false).unwrap_err().to_string();
        assert!(
            err.contains("không có hoặc hỏng"),
            "kết quả cũ mà thiếu meta.json: {err}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
