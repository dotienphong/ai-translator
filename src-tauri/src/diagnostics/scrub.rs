//! Che dữ liệu cá nhân và phát hiện dữ liệu nhạy cảm còn sót trong báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §2).
//!
//! Hợp đồng với server (`server/src/diagnostics-scan.ts`, `findSensitive`) là file vector chung `server/test/vectors/scrub-v1.json`:
//! test bên dưới nạp đúng file đó. Sửa mẫu ở đây thì sửa bản TypeScript và vector cùng lúc.
//! - Mọi `\b` là ASCII (`(?-u:\b)`) như JavaScript; mọi lượng từ có cận trên.
//! - Thứ tự che: Authorization, Bearer, token, key, email, query của URL, rồi thư mục home, tên máy, tên tài khoản.
//! - Thứ tự phát hiện (quy tắc đầu tiên khớp): key, token, Bearer, Authorization, email, đường dẫn home của người khác.

use std::sync::LazyLock;

use regex::Regex;

/// Quy tắc nhạy cảm; tên trong log và trong thông báo lỗi là `as_str`, trùng `SensitiveRule` của server.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rule {
    LicenseKey,
    Token,
    Bearer,
    Authorization,
    Email,
    HomePath,
}

impl Rule {
    pub fn as_str(self) -> &'static str {
        match self {
            Rule::LicenseKey => "license_key",
            Rule::Token => "token",
            Rule::Bearer => "bearer",
            Rule::Authorization => "authorization",
            Rule::Email => "email",
            Rule::HomePath => "home_path",
        }
    }
}

const KEY_GROUPED: &str = r"(?-u:\b)(?:[0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}(?-u:\b)";
const KEY_PLAIN: &str = r"(?-u:\b)[0-9A-HJKMNP-TV-Z]{28}(?-u:\b)";
const TOKEN: &str = r"(?-u:\b)v1\.[A-Za-z0-9_-]{16,2048}\.[A-Za-z0-9_-]{16,2048}";
const BEARER: &str = r"(?i)(?-u:\b)bearer\s+[A-Za-z0-9._~+/=-]{8,2048}";
const AUTHORIZATION: &str = r"(?i)(?-u:\b)authorization\s*[:=]\s*[^\s<]";
const EMAIL: &str = r"[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}";
const UNIX_HOME: &str = r#"(?:^|[^A-Za-z0-9_])/(?:Users|home)/([^/\s"'<>:*?|\\]{1,128})"#;
const WINDOWS_HOME: &str = r#"(?i)[A-Za-z]:[\\/]{1,4}Users[\\/]{1,4}([^\\/\s"'<>:*?|]{1,128})"#;
/// Thư mục không phải của một người (so không phân biệt hoa thường; `All Users` bị cắt ở khoảng trắng nên là `all`).
const NEUTRAL_HOME_NAMES: [&str; 4] = ["shared", "public", "default", "all"];

// Chỉ để che (không phải để phát hiện).
const AUTH_LINE: &str = r"(?i)((?-u:\b)authorization\s*[:=]\s*)[^\r\n]+";
const BEARER_VALUE: &str = r"(?i)((?-u:\b)bearer\s+)[A-Za-z0-9._~+/=-]{8,2048}";
const URL_QUERY: &str = r#"(https?://[^\s?#"'<>]+)\?[^\s"'<>#]+"#;

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("mẫu regex cố định hợp lệ")
}

static R_KEY_GROUPED: LazyLock<Regex> = LazyLock::new(|| re(KEY_GROUPED));
static R_KEY_PLAIN: LazyLock<Regex> = LazyLock::new(|| re(KEY_PLAIN));
static R_TOKEN: LazyLock<Regex> = LazyLock::new(|| re(TOKEN));
static R_BEARER: LazyLock<Regex> = LazyLock::new(|| re(BEARER));
static R_AUTHORIZATION: LazyLock<Regex> = LazyLock::new(|| re(AUTHORIZATION));
static R_EMAIL: LazyLock<Regex> = LazyLock::new(|| re(EMAIL));
static R_UNIX_HOME: LazyLock<Regex> = LazyLock::new(|| re(UNIX_HOME));
static R_WINDOWS_HOME: LazyLock<Regex> = LazyLock::new(|| re(WINDOWS_HOME));
static R_AUTH_LINE: LazyLock<Regex> = LazyLock::new(|| re(AUTH_LINE));
static R_BEARER_VALUE: LazyLock<Regex> = LazyLock::new(|| re(BEARER_VALUE));
static R_URL_QUERY: LazyLock<Regex> = LazyLock::new(|| re(URL_QUERY));

/// Có đường dẫn `/Users/<tên>` hay `C:\Users\<tên>` mà `<tên>` không phải thư mục dùng chung.
fn has_personal_home(text: &str) -> bool {
    [&*R_UNIX_HOME, &*R_WINDOWS_HOME].iter().any(|r| {
        r.captures_iter(text).any(|c| {
            let name = c.get(1).map_or("", |m| m.as_str()).to_lowercase();
            !NEUTRAL_HOME_NAMES.contains(&name.as_str())
        })
    })
}

/// Quy tắc đầu tiên khớp, hoặc `None` nếu sạch. Cùng thứ tự với `findSensitive` của server.
pub fn find_sensitive(text: &str) -> Option<Rule> {
    if R_KEY_GROUPED.is_match(text) || R_KEY_PLAIN.is_match(text) {
        return Some(Rule::LicenseKey);
    }
    if R_TOKEN.is_match(text) {
        return Some(Rule::Token);
    }
    if R_BEARER.is_match(text) {
        return Some(Rule::Bearer);
    }
    if R_AUTHORIZATION.is_match(text) {
        return Some(Rule::Authorization);
    }
    if R_EMAIL.is_match(text) {
        return Some(Rule::Email);
    }
    if has_personal_home(text) {
        return Some(Rule::HomePath);
    }
    None
}

/// Thông tin của máy này để che: thư mục home, tên tài khoản và tên máy.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Params {
    pub home: String,
    pub user: String,
    pub host: String,
}

impl Params {
    /// Của máy đang chạy: biến môi trường của hệ điều hành và tên máy đã làm sạch (`license::device::label`).
    pub fn current(host: Option<String>) -> Self {
        let var = |names: &[&str]| names.iter().find_map(|n| std::env::var(n).ok()).unwrap_or_default();
        Self {
            home: var(&["HOME", "USERPROFILE"]),
            user: var(&["USER", "USERNAME"]),
            host: host.unwrap_or_default(),
        }
    }
}

/// Tên ngắn hơn ngần này ký tự thì không che theo từ (che "an" sẽ phá mọi chữ "an" trong log).
const MIN_NAME_CHARS: usize = 3;
/// Thư mục home ngắn hơn ngần này ký tự (ví dụ `/`) thì không che: che nó sẽ phá mọi đường dẫn.
const MIN_HOME_CHARS: usize = 4;

/// Che `text`: thứ tự và quy tắc ở đầu file.
pub fn scrub(text: &str, params: &Params) -> String {
    let mut out = R_AUTH_LINE.replace_all(text, "${1}<redacted>").into_owned();
    out = R_BEARER_VALUE.replace_all(&out, "${1}<redacted>").into_owned();
    out = R_TOKEN.replace_all(&out, "<token>").into_owned();
    out = R_KEY_GROUPED.replace_all(&out, "<key>").into_owned();
    out = R_KEY_PLAIN.replace_all(&out, "<key>").into_owned();
    out = R_EMAIL.replace_all(&out, "<email>").into_owned();
    out = R_URL_QUERY.replace_all(&out, "${1}?<query>").into_owned();
    out = replace_home(&out, &params.home);
    out = replace_name(&out, &params.host, "<host>");
    out = replace_name(&out, &params.user, "<user>");
    out
}

/// Thay thư mục home bằng `~`, ở ba dạng viết: nguyên văn, gạch chéo xuôi (Windows), và gạch chéo ngược gấp đôi (đường dẫn
/// in bằng `{:?}`). So không phân biệt hoa thường vì Windows không phân biệt.
fn replace_home(text: &str, home: &str) -> String {
    let home = home.trim_end_matches(['/', '\\']);
    if home.chars().count() < MIN_HOME_CHARS {
        return text.to_string();
    }
    let mut forms = vec![home.to_string()];
    if home.contains('\\') {
        forms.push(home.replace('\\', "/"));
        forms.push(home.replace('\\', "\\\\"));
    }
    // Dạng dài trước, để dạng gấp đôi không bị dạng một gạch ăn mất nửa.
    forms.sort_by_key(|f| std::cmp::Reverse(f.len()));
    let alternatives: Vec<String> = forms.iter().map(|f| regex::escape(f)).collect();
    let pattern = format!("(?i){}", alternatives.join("|"));
    re(&pattern).replace_all(text, "~").into_owned()
}

/// Thay một tên (tên máy, tên tài khoản) theo cả từ, không phân biệt hoa thường.
fn replace_name(text: &str, name: &str, with: &str) -> String {
    let name = name.trim();
    if name.chars().count() < MIN_NAME_CHARS {
        return text.to_string();
    }
    let pattern = format!(r"(?i)(?-u:\b){}(?-u:\b)", regex::escape(name));
    re(&pattern).replace_all(text, with).into_owned()
}

/// Tên người tham dự dài tối thiểu chừng này ký tự mới che (tên một chữ cái không có thật; tên hai ký tự như "An" vẫn che, vì biên từ
/// theo Unicode không để nó phá chữ khác).
const MIN_PARTICIPANT_CHARS: usize = 2;
/// Tên dài hơn chừng này byte không che (khung của worker đã giới hạn 160 byte, `speaker_protocol::MAX_NAME_BYTES`).
const MAX_PARTICIPANT_BYTES: usize = 160;

/// Mẫu một tên người tham dự: không phân biệt hoa thường, biên từ theo Unicode (chữ cái và chữ số), nên "Lan" không bị che trong
/// "Lanh" hay "Lan2".
fn participant_pattern(name: &str) -> Option<Regex> {
    let name = name.trim();
    if name.chars().count() < MIN_PARTICIPANT_CHARS || name.len() > MAX_PARTICIPANT_BYTES {
        return None;
    }
    Regex::new(&format!(
        r"(?i)(^|[^\p{{L}}\p{{N}}]){}($|[^\p{{L}}\p{{N}}])",
        regex::escape(name)
    ))
    .ok()
}

/// Che tên người tham dự đang có trong cuộc họp (spec 2026-10-26-phan-biet-nguoi-noi §10) bằng `<tên>`. Log của app không bao giờ in tên
/// (mọi `Debug` che chữ); đây là lớp bảo vệ thêm cho báo cáo lỗi, tính trên các tên mà app đang giữ (`Host::known_names`).
pub fn redact_names(text: &str, names: &[String]) -> String {
    let mut out = text.to_string();
    for pattern in names.iter().filter_map(|n| participant_pattern(n)) {
        // Hai tên cách nhau một ký tự dùng chung ký tự đó làm biên: lặp tới khi hết thay đổi.
        for _ in 0..4 {
            let next = pattern.replace_all(&out, "${1}<tên>${2}").into_owned();
            if next == out {
                break;
            }
            out = next;
        }
    }
    out
}

/// Còn tên người tham dự nào trong `text` không (kiểm lại sau khi che).
pub fn contains_name(text: &str, names: &[String]) -> bool {
    names
        .iter()
        .filter_map(|n| participant_pattern(n))
        .any(|pattern| pattern.is_match(text))
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(ToString::to_string).collect()
    }

    /// Tên người tham dự (kể cả có dấu, viết hoa khác) bị che; chữ khác chứa tên như một phần thì giữ nguyên.
    #[test]
    fn participant_names_are_redacted_by_whole_word() {
        let n = names(&["Lan Nguyễn", "An", "Bình"]);
        assert_eq!(
            redact_names("họp với lan nguyễn và AN, bình.", &n),
            "họp với <tên> và <tên>, <tên>."
        );
        assert_eq!(redact_names("Lanh, Anna, Bình2, vận", &n), "Lanh, Anna, Bình2, vận");
        assert_eq!(
            redact_names("An Bình", &n),
            "<tên> <tên>",
            "hai tên liền nhau dùng chung một khoảng trắng"
        );
        assert_eq!(redact_names("Lan Nguyễn\nBình", &n), "<tên>\n<tên>");
    }

    #[test]
    fn short_empty_or_huge_names_are_ignored_and_no_names_changes_nothing() {
        let text = "a b c Lan";
        assert_eq!(redact_names(text, &[]), text);
        assert_eq!(redact_names(text, &names(&["", " ", "a"])), text);
        assert!(!contains_name(text, &names(&["a"])));
        // Tên dài quá giới hạn không che (chuỗi có mặt trong văn bản, nên giữ nguyên chứng tỏ bị bỏ qua); đúng giới hạn thì che.
        let huge = "x".repeat(MAX_PARTICIPANT_BYTES + 1);
        let text = format!("a b c Lan {huge} end");
        assert_eq!(redact_names(&text, &names(&[&huge])), text);
        assert!(!contains_name(&text, &names(&[&huge])));
        let max = "x".repeat(MAX_PARTICIPANT_BYTES);
        assert_eq!(
            redact_names(&format!("a {max} b"), &names(&[&max])),
            "a <tên> b",
            "tên đúng giới hạn vẫn được che"
        );
    }

    #[test]
    fn contains_name_sees_what_redaction_removes() {
        let n = names(&["Lan Nguyễn"]);
        assert!(contains_name("gọi LAN NGUYỄN lúc 9h", &n));
        assert!(!contains_name(&redact_names("gọi LAN NGUYỄN lúc 9h", &n), &n));
        assert!(!contains_name("Lan Nguyễnx", &n));
    }

    /// Tên có ký tự đặc biệt của regex không làm hỏng mẫu hay che nhầm.
    #[test]
    fn regex_characters_in_names_are_literal() {
        let n = names(&["A.B (Guest)", "x+y"]);
        assert_eq!(
            redact_names("A.B (Guest) và AxB (Guest), x+y, xxy", &n),
            "<tên> và AxB (Guest), <tên>, xxy"
        );
    }

    /// File vector dùng chung với server (`server/test/vectors/scrub-v1.json`).
    const VECTORS: &str = include_str!("../../../server/test/vectors/scrub-v1.json");

    #[derive(Deserialize)]
    struct Vectors {
        scrub_defaults: ParamsJson,
        detect: Vec<Detect>,
        clean: Vec<Clean>,
        scrub: Vec<ScrubCase>,
    }

    #[derive(Deserialize, Clone)]
    struct ParamsJson {
        home: String,
        user: String,
        host: String,
    }

    #[derive(Deserialize)]
    struct Detect {
        name: String,
        text: String,
        rule: String,
    }

    #[derive(Deserialize)]
    struct Clean {
        name: String,
        text: String,
    }

    #[derive(Deserialize)]
    struct ScrubCase {
        name: String,
        params: Option<ParamsJson>,
        input: String,
        expected: String,
    }

    fn vectors() -> Vectors {
        serde_json::from_str(VECTORS).expect("file vector đọc được")
    }

    fn params(p: &ParamsJson) -> Params {
        Params {
            home: p.home.clone(),
            user: p.user.clone(),
            host: p.host.clone(),
        }
    }

    #[test]
    fn every_detect_vector_is_flagged_with_the_expected_rule() {
        for case in vectors().detect {
            let rule = find_sensitive(&case.text).map(Rule::as_str);
            assert_eq!(rule, Some(case.rule.as_str()), "{}", case.name);
        }
    }

    #[test]
    fn every_clean_vector_passes() {
        for case in vectors().clean {
            assert_eq!(find_sensitive(&case.text), None, "{}", case.name);
        }
    }

    #[test]
    fn every_scrub_vector_produces_the_expected_text_and_it_is_clean() {
        let v = vectors();
        for case in &v.scrub {
            let p = params(case.params.as_ref().unwrap_or(&v.scrub_defaults));
            let out = scrub(&case.input, &p);
            assert_eq!(out, case.expected, "{}", case.name);
            assert_eq!(find_sensitive(&out), None, "{}: kết quả còn mẫu nhạy cảm", case.name);
        }
    }

    #[test]
    fn scrubbing_twice_changes_nothing() {
        let v = vectors();
        let p = params(&v.scrub_defaults);
        for case in v.scrub.iter().filter(|c| c.params.is_none()) {
            let once = scrub(&case.input, &p);
            assert_eq!(scrub(&once, &p), once, "{}", case.name);
        }
    }

    #[test]
    fn a_debug_printed_windows_path_with_doubled_backslashes_is_scrubbed() {
        let p = Params {
            home: r"C:\Users\alice".into(),
            user: "alice".into(),
            host: "ALICE-PC".into(),
        };
        let out = scrub(r#"không mở được "C:\\Users\\alice\\AppData\\x.db""#, &p);
        assert_eq!(out, r#"không mở được "~\\AppData\\x.db""#);
        assert_eq!(find_sensitive(&out), None);
        let out = scrub("đọc C:/Users/Alice/AppData/x", &p);
        assert_eq!(out, "đọc ~/AppData/x");
    }

    #[test]
    fn a_root_like_home_is_never_replaced() {
        let p = Params {
            home: "/".into(),
            user: "root".into(),
            host: String::new(),
        };
        assert_eq!(scrub("mở /usr/local/bin", &p), "mở /usr/local/bin");
        let p = Params {
            home: "/root".into(),
            ..Params::default()
        };
        assert_eq!(scrub("mở /root/x", &p), "mở ~/x");
    }

    #[test]
    fn empty_params_replace_nothing() {
        assert_eq!(
            scrub("chữ bình thường alice", &Params::default()),
            "chữ bình thường alice"
        );
    }

    #[test]
    fn long_lines_do_not_make_the_matchers_slow() {
        let started = std::time::Instant::now();
        let p = Params::default();
        for text in [
            "a".repeat(60_000),
            "a.".repeat(30_000),
            "ABCD-".repeat(12_000),
            "v1.".repeat(20_000),
            "/Users/".repeat(8_000),
        ] {
            let _ = find_sensitive(&text);
            let _ = scrub(&text, &p);
        }
        assert!(
            started.elapsed() < std::time::Duration::from_secs(5),
            "{:?}",
            started.elapsed()
        );
    }
}
