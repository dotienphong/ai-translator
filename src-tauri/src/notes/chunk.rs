//! Bản chép lời thành các dòng prompt đánh số, và chia các dòng đó thành đoạn vừa ngân sách token của model.
//! Module này chỉ đọc `Transcript`; không ghi vào `TranscriptStore` và không dùng đường dịch của `pipeline`.

use pipeline::subtitle::{Status, Subtitle};

use crate::transcript::store::Transcript;

/// Một câu của cuộc họp như model đọc: `seq` là vị trí câu trong `Transcript::lines` cộng 1 (giữ nguyên số khi câu
/// bị bỏ, để mọi đoạn chia ra vẫn trỏ về đúng câu của bản chép lời).
#[derive(Clone, Debug, PartialEq)]
pub struct PromptLine {
    pub seq: u32,
    pub speaker: Option<String>,
    pub text: String,
    /// Câu gốc (đã `trim`) khi `text` là bản dịch khác câu gốc; `None` khi `text` đã là câu gốc hay câu gốc rỗng. Chỉ lượt
    /// kiểm đọc nó ([`render_verify`]): lượt trích ([`render`]) không bao giờ thấy câu gốc.
    pub source: Option<String>,
}

/// Chữ của câu theo đúng luật của `transcript::export::translation`: bản dịch khi câu đang ở trạng thái có dịch và bản dịch
/// không rỗng, không thì câu gốc. Câu bị bỏ (`Dropped`) không có chữ.
fn text_of(line: &Subtitle) -> &str {
    match line.status {
        Status::Dropped => "",
        Status::AsrDone | Status::Translating | Status::Done => {
            let tgt = line.tgt_text.trim();
            if tgt.is_empty() { line.src_text.trim() } else { tgt }
        }
        Status::Failed | Status::SameLang | Status::Skipped => line.src_text.trim(),
    }
}

/// Các câu có chữ của bản chép lời, theo thứ tự, kèm nhãn người nói (đã tính đổi tên, gộp).
pub fn lines_of(t: &Transcript) -> Vec<PromptLine> {
    t.lines
        .iter()
        .enumerate()
        .filter_map(|(i, line)| {
            let text = text_of(line);
            if text.is_empty() {
                return None;
            }
            let src = line.src_text.trim();
            let source = (!src.is_empty() && src != text).then(|| src.to_string());
            Some(PromptLine {
                seq: u32::try_from(i.saturating_add(1)).unwrap_or(u32::MAX),
                speaker: t.speaker_label(line).map(str::to_string),
                text: text.to_string(),
                source,
            })
        })
        .collect()
}

/// Dựng các dòng thành chữ đưa vào prompt: `[seq] Người nói: chữ` mỗi dòng; không có `Người nói: ` khi chưa rõ người nói.
pub fn render(lines: &[PromptLine]) -> String {
    let mut out = String::new();
    for l in lines {
        out.push_str(&format!("[{}] ", l.seq));
        if let Some(who) = &l.speaker {
            out.push_str(who);
            out.push_str(": ");
        }
        out.push_str(&l.text);
        out.push('\n');
    }
    out
}

/// Dựng các câu quanh những câu được trích dẫn, cho lượt kiểm: câu có `seq` trong `r - around ..= r + around` của một `r`
/// nào đó (theo thứ tự các dòng). Mỗi câu là `[seq] Người nói: <câu gốc>`; khi có bản dịch khác câu gốc, thêm một dòng
/// `    → <bản dịch>`. Câu gốc là `source` nếu có, không thì `text` (đã là câu gốc).
pub fn render_verify(lines: &[PromptLine], refs: &[u32], around: u32) -> String {
    let mut out = String::new();
    for l in lines {
        let near = refs
            .iter()
            .any(|&r| l.seq >= r.saturating_sub(around) && l.seq <= r.saturating_add(around));
        if !near {
            continue;
        }
        out.push_str(&format!("[{}] ", l.seq));
        if let Some(who) = &l.speaker {
            out.push_str(who);
            out.push_str(": ");
        }
        match &l.source {
            Some(src) => {
                out.push_str(src);
                out.push_str("\n    → ");
                out.push_str(&l.text);
            }
            None => out.push_str(&l.text),
        }
        out.push('\n');
    }
    out
}

/// Chia tham lam theo thứ tự, không chồng lấn: một câu vào đoạn hiện tại nếu tổng chi phí vẫn không vượt `budget`, không thì
/// mở đoạn mới. Chi phí của câu là `count` của dòng đã dựng. Câu một mình vượt ngân sách vẫn đứng riêng một đoạn (luôn tiến lên).
pub fn chunk(lines: &[PromptLine], budget: usize, count: &dyn Fn(&str) -> usize) -> Vec<Vec<PromptLine>> {
    let mut out: Vec<Vec<PromptLine>> = Vec::new();
    let mut used = 0usize;
    for line in lines {
        let cost = count(&render(std::slice::from_ref(line)));
        match out.last_mut() {
            Some(cur) if used.saturating_add(cost) <= budget => {
                cur.push(line.clone());
                used = used.saturating_add(cost);
            }
            _ => {
                out.push(vec![line.clone()]);
                used = cost;
            }
        }
    }
    out
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::transcript::speakers::VoiceView;

    fn sub(id: u64, src: &str, tgt: &str, status: Status, speaker: Option<u32>) -> Subtitle {
        Subtitle {
            id,
            start_ms: id * 1_000,
            end_ms: id * 1_000 + 900,
            src_lang: "en".into(),
            src_text: src.into(),
            tgt_text: tgt.into(),
            status,
            provisional: false,
            replaces: Vec::new(),
            speaker,
        }
    }

    fn words(n: usize) -> String {
        vec!["w"; n].join(" ")
    }
    fn count(s: &str) -> usize {
        s.split_whitespace().count() // "[1] w w w w" = 5
    }
    fn pl(seq: u32, n: usize) -> PromptLine {
        PromptLine {
            seq,
            speaker: None,
            text: words(n),
            source: None,
        }
    }
    fn line(seq: u32, who: Option<&str>, text: &str, source: Option<&str>) -> PromptLine {
        PromptLine {
            seq,
            speaker: who.map(str::to_string),
            text: text.into(),
            source: source.map(str::to_string),
        }
    }

    #[test]
    fn render_verify_shows_the_original_then_the_translation_around_the_refs() {
        let lines = vec![
            line(1, Some("Lan"), "Chào", Some("Hello")),
            line(2, None, "Same", None),
            line(3, Some("Minh"), "Tôi gửi thứ Sáu", Some("I'll send it Friday")),
            line(5, None, "Xa", Some("Far")),
        ];
        assert_eq!(
            render_verify(&lines, &[3], 1),
            "[2] Same\n[3] Minh: I'll send it Friday\n    → Tôi gửi thứ Sáu\n"
        );
        assert_eq!(render_verify(&lines, &[1], 1), "[1] Lan: Hello\n    → Chào\n[2] Same\n");
        assert_eq!(render_verify(&lines, &[u32::MAX, 0], 1), "[1] Lan: Hello\n    → Chào\n");
        assert_eq!(render_verify(&lines, &[], 1), "");
    }

    #[test]
    fn render_never_contains_the_original_words() {
        let lines = vec![line(1, Some("Lan"), "Chào", Some("Hello-ORIGINAL"))];
        assert!(!render(&lines).contains("ORIGINAL"));
    }
    fn seqs(c: &[Vec<PromptLine>]) -> Vec<Vec<u32>> {
        c.iter().map(|x| x.iter().map(|l| l.seq).collect()).collect()
    }

    #[test]
    fn lines_of_picks_translation_then_source_and_keeps_numbering() {
        // 1 Done có dịch, người nói "Lan"; 2 Done dịch rỗng; 3 Dropped; 4 Failed; 5 SameLang; 6 Skipped; 7 gốc và dịch đều rỗng
        let t = Transcript {
            session: 1,
            started_at: 1_000,
            ended_at: Some(61_000),
            target_lang: "vi".into(),
            lines: vec![
                sub(1, "Good morning.", "  Chào buổi sáng.  ", Status::Done, Some(1)),
                sub(2, "Second source.", "   ", Status::Done, None),
                sub(3, "Dropped source.", "", Status::Dropped, None),
                sub(4, "Failed source.", "", Status::Failed, None),
                sub(5, "Same source.", "ignored", Status::SameLang, None),
                sub(6, "Skipped source.", "", Status::Skipped, None),
                sub(7, "", "", Status::Done, None),
            ],
            speakers: vec![VoiceView::saved(1, "Lan".into())],
            speakers_rev: 0,
        };
        let got = lines_of(&t);
        assert_eq!(got.iter().map(|l| l.seq).collect::<Vec<_>>(), [1, 2, 4, 5, 6]);
        assert_eq!(got[0].source.as_deref(), Some("Good morning.")); // có bản dịch khác câu gốc: giữ câu gốc
        assert_eq!(got[1].source, None); // dịch rỗng: chữ đã là câu gốc
        assert!(got[2..].iter().all(|l| l.source.is_none())); // Failed, SameLang, Skipped: chữ đã là câu gốc
        assert_eq!(
            (got[0].speaker.as_deref(), got[0].text.as_str()),
            (Some("Lan"), "Chào buổi sáng.")
        );
        assert_eq!(got[1].text, "Second source."); // dịch rỗng: lấy câu gốc
        assert!(got[2..].iter().all(|l| l.text.ends_with("source."))); // Failed, SameLang, Skipped: câu gốc
        assert_eq!(render(&got[..2]), "[1] Lan: Chào buổi sáng.\n[2] Second source.\n");
    }

    #[test]
    fn chunk_is_greedy_and_always_advances() {
        assert_eq!(
            seqs(&chunk(&[pl(1, 4), pl(2, 4), pl(3, 4)], 10, &count)),
            [vec![1, 2], vec![3]]
        );
        assert_eq!(seqs(&chunk(&[pl(1, 50), pl(2, 2)], 10, &count)), [vec![1], vec![2]]);
        assert!(chunk(&[], 10, &count).is_empty());
    }
}
