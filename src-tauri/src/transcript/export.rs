//! Xuất bản chép lời (spec §6.6 "Xuất file", F4): TXT, SRT, Markdown. Viết phía Rust vì webview chặn `blob:` (§10.2, spec
//! §11); giao diện chỉ chọn định dạng, phía Rust ghi file (`commands`) hoặc trả chữ để sao chép.
//!
//! - **TXT:** mỗi câu là `[giờ] câu gốc` rồi dòng `→ bản dịch`, các câu cách nhau một dòng trống. Giờ là giờ địa phương
//!   lúc câu bắt đầu, `HH:MM:SS`.
//! - **SRT:** chọn xuất câu gốc hay bản dịch; mốc thời gian tính từ đầu phiên (`HH:MM:SS,mmm`), để ghép được với bản ghi
//!   hình của cuộc họp nếu người dùng có.
//! - **Markdown:** tiêu đề có ngày giờ bắt đầu phiên, rồi một bảng ba cột (giờ, câu gốc, bản dịch); ký tự đặc biệt của
//!   Markdown trong câu được thoát.
//!
//! Câu theo trạng thái (§6.6): `dropped` hiện "[bỏ qua đoạn]"; `failed` có bản dịch là "(chưa dịch được)"; `same_lang` và
//! `skipped` chỉ có câu gốc. SRT bản dịch: câu không có bản dịch thì hiện câu gốc. Chữ theo ngôn ngữ giao diện (`i18n.rs`).
//!
//! Giờ địa phương: app không kèm cơ sở dữ liệu múi giờ; giao diện gửi độ lệch so với UTC lúc xuất (`utc_offset_minutes`,
//! từ `Date.getTimezoneOffset()` của webview).

use pipeline::subtitle::{Status, Subtitle};
use serde::Deserialize;

use super::store::Transcript;
use crate::i18n::Strings;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Txt,
    Srt,
    Markdown,
}

impl Format {
    pub fn extension(self) -> &'static str {
        match self {
            Format::Txt => "txt",
            Format::Srt => "srt",
            Format::Markdown => "md",
        }
    }
}

/// Phần chữ của SRT.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SrtText {
    Source,
    Translation,
}

/// Năm, tháng, ngày, giờ, phút, giây theo giờ địa phương.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LocalTime {
    pub year: i64,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub second: u32,
}

/// Giờ Unix (ms) cộng độ lệch múi giờ (phút) ra giờ địa phương. Ngày theo lịch Gregory (thuật toán `civil_from_days` của
/// Howard Hinnant).
pub fn local_time(unix_ms: u64, utc_offset_minutes: i32) -> LocalTime {
    let secs = (unix_ms / 1_000) as i64 + i64::from(utc_offset_minutes) * 60;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    LocalTime {
        year,
        month,
        day,
        hour: (rem / 3_600) as u32,
        minute: (rem % 3_600 / 60) as u32,
        second: (rem % 60) as u32,
    }
}

fn clock(t: &Transcript, line: &Subtitle, offset: i32) -> String {
    let l = local_time(t.started_at + line.start_ms, offset);
    format!("{:02}:{:02}:{:02}", l.hour, l.minute, l.second)
}

fn srt_time(ms: u64) -> String {
    format!(
        "{:02}:{:02}:{:02},{:03}",
        ms / 3_600_000,
        ms / 60_000 % 60,
        ms / 1_000 % 60,
        ms % 1_000
    )
}

/// Câu gốc như người đọc thấy: đoạn bị bỏ thì là "[bỏ qua đoạn]".
fn source(line: &Subtitle, s: &Strings) -> String {
    if line.status == Status::Dropped {
        s.export_dropped.to_string()
    } else {
        line.src_text.clone()
    }
}

/// Bản dịch của câu, nếu câu có bản dịch để hiện.
fn translation(line: &Subtitle, s: &Strings) -> Option<String> {
    match line.status {
        Status::Failed => Some(s.export_failed.to_string()),
        Status::SameLang | Status::Skipped | Status::Dropped => None,
        Status::AsrDone | Status::Translating | Status::Done => {
            Some(line.tgt_text.trim().to_string()).filter(|t| !t.is_empty())
        }
    }
}

pub fn txt(t: &Transcript, utc_offset_minutes: i32, s: &Strings) -> String {
    let mut out = String::new();
    for line in &t.lines {
        out.push_str(&format!(
            "[{}] {}\n",
            clock(t, line, utc_offset_minutes),
            source(line, s)
        ));
        if let Some(tgt) = translation(line, s) {
            out.push_str(&format!("→ {tgt}\n"));
        }
        out.push('\n');
    }
    out
}

pub fn srt(t: &Transcript, text: SrtText, s: &Strings) -> String {
    let mut out = String::new();
    let mut n = 0;
    for line in &t.lines {
        let body = match text {
            SrtText::Source => source(line, s),
            SrtText::Translation => match line.status {
                Status::Failed => source(line, s),
                _ => translation(line, s).unwrap_or_else(|| source(line, s)),
            },
        };
        if body.trim().is_empty() {
            continue;
        }
        n += 1;
        out.push_str(&format!(
            "{n}\n{} --> {}\n{}\n\n",
            srt_time(line.start_ms),
            srt_time(line.end_ms.max(line.start_ms)),
            body.trim()
        ));
    }
    out
}

/// Thoát ký tự có nghĩa trong Markdown và trong bảng, để câu nói hiện đúng nguyên văn.
pub fn escape_markdown(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '\\' | '|' | '*' | '_' | '`' | '[' | ']' | '<' | '>' | '#' | '~' => {
                out.push('\\');
                out.push(c);
            }
            '\n' | '\r' => out.push(' '),
            _ => out.push(c),
        }
    }
    out
}

pub fn markdown(t: &Transcript, utc_offset_minutes: i32, s: &Strings) -> String {
    let start = local_time(t.started_at, utc_offset_minutes);
    let mut out = format!(
        "# {} · {:04}-{:02}-{:02} {:02}:{:02}\n\n| {} | {} | {} |\n|---|---|---|\n",
        s.export_title,
        start.year,
        start.month,
        start.day,
        start.hour,
        start.minute,
        s.export_time,
        s.export_source,
        s.export_translation
    );
    for line in &t.lines {
        out.push_str(&format!(
            "| {} | {} | {} |\n",
            clock(t, line, utc_offset_minutes),
            escape_markdown(&source(line, s)),
            translation(line, s).map(|t| escape_markdown(&t)).unwrap_or_default()
        ));
    }
    out
}

/// Tên file gợi ý khi lưu, theo giờ bắt đầu phiên: `transcript-2026-10-02-1405.txt`.
pub fn file_name(t: &Transcript, format: Format, utc_offset_minutes: i32) -> String {
    let l = local_time(t.started_at, utc_offset_minutes);
    format!(
        "transcript-{:04}-{:02}-{:02}-{:02}{:02}.{}",
        l.year,
        l.month,
        l.day,
        l.hour,
        l.minute,
        format.extension()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::{EN, VI};

    /// 2026-10-02 07:05:00 UTC, tức 14:05:00 giờ Việt Nam (UTC+7).
    const STARTED: u64 = 1_790_924_700_000;
    const HANOI: i32 = 7 * 60;

    fn line(id: u64, start_ms: u64, src: &str, tgt: &str, status: Status) -> Subtitle {
        Subtitle {
            id,
            start_ms,
            end_ms: start_ms + 2_500,
            src_lang: "en".into(),
            src_text: src.into(),
            tgt_text: tgt.into(),
            status,
            provisional: false,
            replaces: Vec::new(),
        }
    }

    fn transcript() -> Transcript {
        Transcript {
            session: 1,
            started_at: STARTED,
            ended_at: Some(STARTED + 60_000),
            target_lang: "vi".into(),
            lines: vec![
                line(
                    1,
                    1_000,
                    "Good morning, everyone.",
                    "Chào buổi sáng mọi người.",
                    Status::Done,
                ),
                line(2, 9_450, "Xin chào.", "", Status::SameLang),
                line(3, 15_000, "", "", Status::Dropped),
                line(4, 3_600_000 + 61_234, "The *final* | answer", "", Status::Failed),
            ],
        }
    }

    #[test]
    fn local_time_follows_the_calendar_and_the_offset() {
        let l = local_time(STARTED, HANOI);
        assert_eq!(
            (l.year, l.month, l.day, l.hour, l.minute, l.second),
            (2026, 10, 2, 14, 5, 0)
        );
        let utc = local_time(STARTED, 0);
        assert_eq!((utc.day, utc.hour), (2, 7));
        // Lệch âm qua nửa đêm, năm nhuận, đầu năm.
        let ny = local_time(STARTED, -9 * 60);
        assert_eq!((ny.day, ny.hour), (1, 22));
        let leap = local_time(1_709_164_800_000, 0); // 2024-02-29 00:00 UTC
        assert_eq!((leap.year, leap.month, leap.day), (2024, 2, 29));
        let epoch = local_time(0, 0);
        assert_eq!((epoch.year, epoch.month, epoch.day, epoch.hour), (1970, 1, 1, 0));
    }

    #[test]
    fn txt_has_time_source_then_translation() {
        assert_eq!(
            txt(&transcript(), HANOI, &VI),
            "[14:05:01] Good morning, everyone.\n→ Chào buổi sáng mọi người.\n\n\
             [14:05:09] Xin chào.\n\n\
             [14:05:15] [bỏ qua đoạn]\n\n\
             [15:06:01] The *final* | answer\n→ (chưa dịch được)\n\n"
        );
        assert!(txt(&transcript(), HANOI, &EN).contains("[segment skipped]"));
        assert_eq!(txt(&Transcript::default(), 0, &VI), "");
    }

    #[test]
    fn srt_uses_session_offsets_and_the_chosen_text() {
        assert_eq!(
            srt(&transcript(), SrtText::Translation, &VI),
            "1\n00:00:01,000 --> 00:00:03,500\nChào buổi sáng mọi người.\n\n\
             2\n00:00:09,450 --> 00:00:11,950\nXin chào.\n\n\
             3\n00:00:15,000 --> 00:00:17,500\n[bỏ qua đoạn]\n\n\
             4\n01:01:01,234 --> 01:01:03,734\nThe *final* | answer\n\n"
        );
        let source = srt(&transcript(), SrtText::Source, &EN);
        assert!(source.starts_with("1\n00:00:01,000 --> 00:00:03,500\nGood morning, everyone.\n\n"));
        let empty = Transcript {
            lines: vec![line(1, 0, "  ", "", Status::SameLang)],
            ..transcript()
        };
        assert_eq!(srt(&empty, SrtText::Source, &VI), "", "câu rỗng không thành mục SRT");
    }

    #[test]
    fn markdown_is_a_table_with_escaped_text() {
        assert_eq!(
            markdown(&transcript(), HANOI, &VI),
            "# Bản chép lời · 2026-10-02 14:05\n\n\
             | Giờ | Câu gốc | Bản dịch |\n|---|---|---|\n\
             | 14:05:01 | Good morning, everyone. | Chào buổi sáng mọi người. |\n\
             | 14:05:09 | Xin chào. |  |\n\
             | 14:05:15 | \\[bỏ qua đoạn\\] |  |\n\
             | 15:06:01 | The \\*final\\* \\| answer | (chưa dịch được) |\n"
        );
        assert!(markdown(&transcript(), 0, &EN).starts_with("# Transcript · 2026-10-02 07:05\n"));
        assert_eq!(escape_markdown("a\nb_c\\d"), "a b\\_c\\\\d");
    }

    #[test]
    fn file_names_follow_the_session_start() {
        assert_eq!(
            file_name(&transcript(), Format::Markdown, HANOI),
            "transcript-2026-10-02-1405.md"
        );
        assert_eq!(
            file_name(&transcript(), Format::Srt, 0),
            "transcript-2026-10-02-0705.srt"
        );
    }
}
