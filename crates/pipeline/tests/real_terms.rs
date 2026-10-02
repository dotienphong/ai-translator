//! Thuật ngữ với `llama-server` và Hy-MT2 thật (spec §6.5 "Thuật ngữ"): mỗi câu được dịch hai lần, không có và có từ
//! điển (mẫu "terminology"), rồi đếm số thuật ngữ có bản dịch đúng như từ điển. Model 1,8B không luôn theo từ điển, nên
//! test chỉ đòi có từ điển thì đúng nhiều hơn hẳn không có, và in bảng để ghi vào kế hoạch. Cần model và binary nên bị bỏ
//! qua mặc định. Chạy từ gốc repo, với từng model:
//!
//! ```text
//! MT_LLAMA_SERVER=$PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
//! MT_MT_MODEL=$PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf cargo test -p pipeline --test real_terms -- --include-ignored --nocapture
//! ```

use pipeline::config::MtConfig;
use pipeline::glossary::{Glossary, Term};
use pipeline::llama::{LlamaLaunch, LlamaServer};
use pipeline::prompt::Lang;
use pipeline::translate::{Job, Outcome, translate};
use std::ops::ControlFlow;
use std::path::PathBuf;

fn env(name: &str) -> PathBuf {
    PathBuf::from(std::env::var(name).unwrap_or_else(|_| panic!("đặt {name}")))
}

fn term(source: &str, target: &str) -> Term {
    Term {
        source: source.into(),
        target: target.into(),
    }
}

fn run(server: &mut LlamaServer, text: &str, src: Lang, terms: &[Term]) -> String {
    let job = Job {
        text,
        src,
        tgt: Lang::Vi,
        context: None,
        terms,
    };
    match translate(server, &job, &MtConfig::default(), &mut |_| ControlFlow::Continue(())) {
        Outcome::Done(done) => done.text,
        other => panic!("{text}: {other:?}"),
    }
}

#[test]
#[ignore = "cần model và binary thật, xem đầu file"]
fn real_model_follows_the_glossary_more_often() {
    let log = std::env::temp_dir().join(format!("pipeline-real-terms-{}.log", std::process::id()));
    let mut server = LlamaServer::spawn(&LlamaLaunch::new(&env("MT_LLAMA_SERVER"), &env("MT_MT_MODEL"), &log)).unwrap();
    let glossary = Glossary::new([
        term("sprint", "sprint"),
        term("standup", "họp đứng"),
        term("churn rate", "tỉ lệ rời bỏ"),
        term("onboarding", "quy trình làm quen"),
        term("backlog", "danh sách tồn đọng"),
        term("灰度发布", "phát hành thử nghiệm"),
        term("スプリント", "sprint"),
        term("스프린트", "sprint"),
    ]);
    let cases = [
        ("The sprint ends on Friday, so the standup moves to nine.", Lang::En),
        ("Our churn rate dropped after the onboarding change.", Lang::En),
        ("The backlog is too long for this quarter.", Lang::En),
        ("灰度发布下周开始。", Lang::Zh),
        ("来週のスプリントでログイン画面を直します。", Lang::Ja),
        ("다음 주 스프린트에서 결제 화면을 고칩니다.", Lang::Ko),
    ];
    let (mut total, mut plain_hits, mut glossary_hits) = (0, 0, 0);
    for (text, src) in cases {
        let terms = glossary.matches(text);
        assert!(!terms.is_empty(), "{text}");
        let plain = run(&mut server, text, src, &[]);
        let with_terms = run(&mut server, text, src, &terms);
        let hits = |out: &str| {
            terms
                .iter()
                .filter(|t| out.to_lowercase().contains(&t.target.to_lowercase()))
                .count()
        };
        total += terms.len();
        plain_hits += hits(&plain);
        glossary_hits += hits(&with_terms);
        println!(
            "{text}\n  không từ điển ({}/{}): {plain}\n  có từ điển   ({}/{}): {with_terms}",
            hits(&plain),
            terms.len(),
            hits(&with_terms),
            terms.len()
        );
    }
    println!("thuật ngữ đúng như từ điển: không từ điển {plain_hits}/{total}, có từ điển {glossary_hits}/{total}");
    assert!(
        glossary_hits >= plain_hits + 3,
        "có từ điển phải đúng nhiều hơn hẳn: {glossary_hits} so với {plain_hits} trên {total}"
    );
}
