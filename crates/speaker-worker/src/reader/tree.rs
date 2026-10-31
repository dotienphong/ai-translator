//! Cây giao diện mà bộ đọc tên duyệt (spec §6.2), qua trait [`Tree`]: bộ cây ghi sẵn ([`FixtureTree`], test và `pnpm
//! recipes:update` của kế hoạch 06) và Accessibility thật (`macos::AxTree`, kế hoạch 04 Task 12; UI Automation ở kế hoạch 05)
//! dùng chung mã duyệt và lấy mẫu (`extract`).
//!
//! Đọc chữ có chọn lọc (QĐ 3 của kế hoạch 04): [`Tree::shape`] không có chữ; [`Tree::text`] chỉ được gọi cho tiêu đề cửa sổ,
//! tiêu đề vùng web, phần tử khớp hình dạng của ô và phần tử bên trong ô.

use std::path::Path;

use serde::Deserialize;
use speaker_recipe::Attrs;

pub trait Tree {
    type Node: Clone;
    /// Chỉ vai trò (rẻ nhất): trên đường tới vùng web của trình duyệt chỉ đọc chừng này.
    fn role(&mut self, node: &Self::Node) -> Option<String>;
    /// Vai trò, vai trò phụ, id, lớp; tiêu đề, mô tả, giá trị để trống. `None` khi phần tử không còn.
    fn shape(&mut self, node: &Self::Node) -> Option<Attrs>;
    /// Điền tiêu đề, mô tả, giá trị vào `attrs`. `false` khi phần tử không còn.
    fn text(&mut self, node: &Self::Node, attrs: &mut Attrs) -> bool;
    fn children(&mut self, node: &Self::Node) -> Vec<Self::Node>;
}

/// Một ảnh chụp của bộ cây ghi sẵn: giây từ đầu bản ghi và các dòng `độ sâu|role|subrole|title|desc|value|ident|help|dom|lớp`.
#[derive(Deserialize, Clone)]
pub struct Snapshot {
    pub t: f64,
    pub lines: Vec<String>,
}

pub fn read_snapshots(path: &Path) -> std::io::Result<Vec<Snapshot>> {
    std::fs::read_to_string(path)?
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).map_err(std::io::Error::other))
        .collect()
}

/// Cây dựng từ một ảnh chụp. Nút là chỉ số; `texts_read` ghi những nút đã bị đọc chữ (test quyền riêng tư).
#[derive(Default)]
pub struct FixtureTree {
    nodes: Vec<(Attrs, Vec<usize>)>,
    pub texts_read: Vec<usize>,
}

impl FixtureTree {
    /// Dòng độ sâu d là con của dòng gần nhất phía trước có độ sâu nhỏ hơn (bản ghi bỏ nút không có chữ hay lớp, nên "con" có thể
    /// là cháu thật; neo tìm theo độ sâu tối đa nên vẫn đúng). Trả cây và các gốc (cửa sổ, độ sâu nhỏ nhất).
    pub fn parse(lines: &[String]) -> (Self, Vec<usize>) {
        let mut tree = FixtureTree::default();
        let mut roots = Vec::new();
        let mut stack: Vec<(usize, u32)> = Vec::new();
        for line in lines {
            let f: Vec<&str> = line.splitn(10, '|').collect();
            if f.len() < 10 {
                continue;
            }
            let Ok(depth) = f[0].parse::<u32>() else { continue };
            let attrs = Attrs {
                role: f[1].into(),
                subrole: f[2].into(),
                title: f[3].into(),
                desc: f[4].into(),
                value: f[5].into(),
                ident: f[6].into(),
                dom_id: f[8].into(),
                classes: f[9].split_whitespace().map(String::from).collect(),
            };
            let id = tree.nodes.len();
            tree.nodes.push((attrs, Vec::new()));
            while stack.last().is_some_and(|&(_, d)| d >= depth) {
                stack.pop();
            }
            match stack.last() {
                Some(&(parent, _)) => tree.nodes[parent].1.push(id),
                None => roots.push(id),
            }
            stack.push((id, depth));
        }
        (tree, roots)
    }

    /// Tiêu đề, id của một nút (cửa sổ): bộ đọc thật đọc riêng hai thuộc tính này để nhận cửa sổ họp (spec §6.1).
    pub fn title(&self, node: usize) -> &str {
        &self.nodes[node].0.title
    }

    pub fn ident(&self, node: usize) -> &str {
        &self.nodes[node].0.ident
    }

    /// AXSubrole của cửa sổ (dòng 0 của bản ghi); bộ đọc thật đọc riêng thuộc tính này (luật `window_subrole`).
    pub fn subrole(&self, node: usize) -> &str {
        &self.nodes[node].0.subrole
    }
}

impl Tree for FixtureTree {
    type Node = usize;

    fn role(&mut self, node: &usize) -> Option<String> {
        self.nodes.get(*node).map(|n| n.0.role.clone())
    }

    fn shape(&mut self, node: &usize) -> Option<Attrs> {
        self.nodes.get(*node).map(|n| Attrs {
            title: String::new(),
            desc: String::new(),
            value: String::new(),
            ..n.0.clone()
        })
    }

    fn text(&mut self, node: &usize, attrs: &mut Attrs) -> bool {
        let Some(n) = self.nodes.get(*node) else { return false };
        self.texts_read.push(*node);
        attrs.title = n.0.title.clone();
        attrs.desc = n.0.desc.clone();
        attrs.value = n.0.value.clone();
        true
    }

    fn children(&mut self, node: &usize) -> Vec<usize> {
        self.nodes.get(*node).map(|n| n.1.clone()).unwrap_or_default()
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn fixture_path(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../scripts/speaker-recipes/fixtures")
            .join(name)
    }

    pub(crate) fn fixture(name: &str) -> Vec<Snapshot> {
        let path = fixture_path(name);
        read_snapshots(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
    }

    /// Sự thật của một fixture: (giây, ai, bật mic hay tắt), theo thời gian.
    pub(crate) fn truth(name: &str) -> Vec<(f64, String, bool)> {
        let path = fixture_path(&name.replace(".jsonl", ".truth.json"));
        let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let mut steps: Vec<(f64, String, bool)> = v["steps"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| {
                (
                    s["t"].as_f64().unwrap(),
                    s["who"].as_str().unwrap().to_string(),
                    s["on"].as_bool().unwrap(),
                )
            })
            .collect();
        steps.sort_by(|a, b| a.0.total_cmp(&b.0));
        steps
    }

    #[test]
    fn lines_nest_by_depth_even_with_gaps() {
        let lines: Vec<String> = [
            "0|AXWindow|AXStandardWindow|Meeting with Hoa Phạm||||||",
            "6|AXWebArea||Meeting with Hoa Phạm||||||",
            "21|AXMenuItem||Lan (Guest), Context menu is available|Lan (Guest), Context menu is available|||||fui-Flex",
            "22|AXGroup|AXEmptyGroup|||||||fui-Flex vdi-frame-occlusion",
            "21|AXMenuItem||Minh (Guest), Context menu is available|Minh (Guest), Context menu is available|||||fui-Flex",
            "0|AXWindow|AXStandardWindow|Chat||||||",
        ]
        .map(String::from)
        .to_vec();
        let (mut t, roots) = FixtureTree::parse(&lines);
        assert_eq!(roots, [0, 5]);
        assert_eq!(t.children(&0), [1]);
        assert_eq!(t.children(&1), [2, 4]);
        assert_eq!(t.children(&2), [3]);
        let s = t.shape(&3).unwrap();
        assert_eq!(s.role, "AXGroup");
        assert_eq!(s.classes, ["fui-Flex", "vdi-frame-occlusion"]);
        assert!(!s.has_text(), "hình dạng không có chữ");
        let mut a = t.shape(&2).unwrap();
        assert!(t.text(&2, &mut a));
        assert!(a.label().starts_with("Lan"));
        assert_eq!(t.texts_read, [2], "ghi lại phần tử đã đọc chữ");
        assert_eq!(t.title(5), "Chat");
    }

    #[test]
    fn the_fixtures_load_in_time_order() {
        for name in [
            "teams-macos-people-closed.jsonl",
            "teams-macos-people-open.jsonl",
            "meet-chrome-macos.jsonl",
            "zoom-macos-synthetic.jsonl",
            "teams-windows-people-open.jsonl",
            "teams-windows-people-open-2.jsonl",
        ] {
            let snaps = fixture(name);
            assert!(snaps.len() >= 5, "{name}: {} ảnh chụp", snaps.len());
            assert!(snaps.windows(2).all(|w| w[0].t <= w[1].t), "{name}");
            assert!(snaps.iter().all(|s| !s.lines.is_empty()), "{name}");
        }
        assert!(!truth("teams-macos-people-closed.jsonl").is_empty());
    }

    /// Có chuỗi dạng UUID (8-4-4-4-12 chữ số hex) không; viết tay để crate không cần `regex`.
    fn has_uuid(s: &str) -> bool {
        let b = s.as_bytes();
        (0..b.len()).any(|i| {
            let mut j = i;
            for (k, n) in [8, 4, 4, 4, 12].into_iter().enumerate() {
                if k > 0 {
                    if b.get(j) != Some(&b'-') {
                        return false;
                    }
                    j += 1;
                }
                for _ in 0..n {
                    if !b.get(j).is_some_and(u8::is_ascii_hexdigit) {
                        return false;
                    }
                    j += 1;
                }
            }
            true
        })
    }

    /// Định danh bot Teams `28:<id>`: "28:" không đi sau chữ, số hay ":" (giờ "1:28:15", "10:28:15"), theo sau là chữ cái hay UUID
    /// (không phải chữ số: thời lượng cuộc gọi "28:30" không bị chặn; rà soát lần 3).
    fn has_bot_id(s: &str) -> bool {
        let b = s.as_bytes();
        s.match_indices("28:").any(|(i, _)| {
            let before = i.checked_sub(1).map(|j| b[j]);
            let rest = &b[i + 3..];
            let guid = rest.len() > 8 && rest[..8].iter().all(u8::is_ascii_hexdigit) && rest[8] == b'-';
            !before.is_some_and(|c| c.is_ascii_alphanumeric() || c == b':')
                && (rest.first().is_some_and(u8::is_ascii_alphabetic) || guid)
        })
    }

    /// Giải base64 chuẩn hay urlsafe (có hay không `=`); `None` khi có ký tự ngoài bảng chữ.
    fn b64_decode(s: &str) -> Option<Vec<u8>> {
        let (mut out, mut acc, mut bits) = (Vec::new(), 0u32, 0u32);
        for c in s.trim_end_matches('=').bytes() {
            let v = match c {
                b'A'..=b'Z' => c - b'A',
                b'a'..=b'z' => c - b'a' + 26,
                b'0'..=b'9' => c - b'0' + 52,
                b'+' | b'-' => 62,
                b'/' | b'_' => 63,
                _ => return None,
            };
            acc = (acc << 6) | u32::from(v);
            bits += 6;
            if bits >= 8 {
                bits -= 8;
                out.push((acc >> bits) as u8);
                acc &= (1 << bits) - 1;
            }
        }
        Some(out)
    }

    /// Byte đã giải có chữ của định danh tài khoản Teams: `guest`, `livecid`, `live:`, `orgid`, `teamsvisitor`, hay 8 chữ số hex
    /// (có thể thêm "8") rồi một chữ g–z, như lớp `bkg_<base64>` của ô video ("<8 hex>8guest…", "<8 hex>8livecid").
    fn looks_like_account_id(raw: &[u8]) -> bool {
        let low = raw.to_ascii_lowercase();
        let has = |w: &[u8]| low.windows(w.len()).any(|x| x == w);
        let hex8_letter = (0..low.len()).any(|i| {
            low.len() >= i + 9 && low[i..i + 8].iter().all(u8::is_ascii_hexdigit) && {
                let j = if low[i + 8] == b'8' { i + 9 } else { i + 8 };
                low.get(j).is_some_and(|c| (b'g'..=b'z').contains(c))
            }
        });
        [&b"guest"[..], b"livecid", b"live:", b"orgid", b"teamsvisitor"]
            .into_iter()
            .any(has)
            || hex8_letter
    }

    /// Có chuỗi ≥ 16 ký tự `[A-Za-z0-9+/=_-]` (hay đoạn sau `_`, `-` của nó, lệch 0–3 ký tự) giải base64 ra định danh tài khoản
    /// không (rà soát fixture Task 3: lớp `bkg_<base64>` của Teams mã hóa một mảnh định danh tài khoản).
    fn has_b64_account_id(text: &str) -> bool {
        let is_b64 = |c: char| c.is_ascii_alphanumeric() || "+/=_-".contains(c);
        let tokens: std::collections::HashSet<&str> =
            text.split(|c: char| !is_b64(c)).filter(|t| t.len() >= 16).collect();
        tokens.into_iter().any(|tok| {
            let starts = std::iter::once(0).chain(tok.match_indices(['_', '-']).map(|(i, _)| i + 1));
            starts.into_iter().any(|start| {
                let piece = tok[start..].trim_end_matches('=');
                (0..4).any(|off| {
                    piece.len() >= off + 16 && b64_decode(&piece[off..]).is_some_and(|raw| looks_like_account_id(&raw))
                })
            })
        })
    }

    /// Lớp `bkg_` còn nguyên: sau `bkg_` là chữ base64 và không phải id giả `bkg_anon-N` (chữ mô tả như `bkg_<base64>` không bị bắt).
    fn has_raw_bkg(text: &str) -> bool {
        text.match_indices("bkg_").any(|(i, _)| {
            let rest = &text[i + 4..];
            rest.starts_with(|c: char| c.is_ascii_alphanumeric() || c == '+' || c == '/') && !rest.starts_with("anon-")
        })
    }

    /// Mẫu cấm đầu tiên có trong văn bản của một fixture. Văn bản là JSON: `\\` (dấu `\` đã thoát) quy về `\` trước khi so, để
    /// `C:\\Users` trong JSON vẫn bị bắt (rà soát lần 2 A-NHỎ 1).
    fn forbidden_in(text: &str) -> Option<String> {
        let low = text.to_lowercase().replace("\\\\", "\\");
        let bad = [
            "8:live:",
            "8:orgid:",
            "8:guest:",
            "8:teamsvisitor:",
            ".cid.",
            "@",
            "http",
            "/users/",
            "c:\\users",
            "c:/users",
        ];
        if let Some(b) = bad.iter().find(|b| low.contains(*b)) {
            return Some((*b).to_string());
        }
        if has_bot_id(text) {
            return Some("28:<id>".into());
        }
        if has_raw_bkg(text) {
            return Some("bkg_<base64>".into());
        }
        if has_b64_account_id(text) {
            return Some("định danh base64".into());
        }
        has_uuid(text).then(|| "UUID".into())
    }

    /// QĐ 16 (rà soát A-C1): fixture công khai không có định danh tài khoản Teams, email, liên kết, đường dẫn người dùng, UUID.
    /// Quét mọi file trong thư mục fixture của repo (không đọc `$DATA`), để fixture ghi lại sau này (kế hoạch 06) cũng bị chặn.
    #[test]
    fn fixtures_have_no_account_ids_links_or_paths() {
        let dir = fixture_path("");
        let mut files = 0;
        for entry in std::fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            let text = std::fs::read_to_string(&path).unwrap();
            assert_eq!(forbidden_in(&text), None, "{}", path.display());
            files += 1;
        }
        assert!(files >= 10, "{files} file");
        // Chính phép kiểm bắt được từng mẫu (cả dạng thoát của JSON), và không bắt id giả, giờ.
        for bad in [
            r#"{"dom":"roster-avatar-img-8:live:.cid.x"}"#,
            r#"{"p":"C:\\Users\\x"}"#,
            "C:/Users/x",
            "/Users/x",
            "28:bot-abc",
            "28:123e4567-e89b-12d3-a456-426614174000",
            "a@b.co",
            "HTTPS://x",
            "x-123e4567-e89b-12d3-a456-426614174000",
        ] {
            assert!(forbidden_in(bad).is_some(), "{bad}");
        }
        assert_eq!(
            forbidden_in("anon-1 uuid-2 17:26 10:28:15 1:28:15 28:30 abc-defg-hij"),
            None
        );
        assert!(has_bot_id("28:bot-abc") && has_bot_id("x 28:123e4567-e89b"));
        assert!(!has_bot_id("28:30") && !has_bot_id("1:28:15") && !has_bot_id("10:28:15"));
        // Lớp `bkg_<base64>` của Teams (định danh giả "deadbeef8guest01", "0badc0de8livecid"), còn nguyên hay đứng riêng, base64
        // chuẩn hay urlsafe; id giả và lớp thường của Meet, Teams không bị bắt.
        for bad in [
            "fui-Flex bkg_ZGVhZGJlZWY4Z3Vlc3QwMQ",
            "bkg_MGJh",
            "ZGVhZGJlZWY4Z3Vlc3QwMQ==",
            "x MGJhZGMwZGU4bGl2ZWNpZA y",
            "id-MGJhZGMwZGU4bGl2ZWNpZA",
            "-zBiYWRjMGRlOGxpdmVjaWQ=",
        ] {
            assert!(forbidden_in(bad).is_some(), "{bad}");
        }
        assert_eq!(
            forbidden_in(
                "`bkg_<base64>` bkg_anon-1 bkg_anon-12 VYBDae-Bz112c-LgbsSe-OWXEXe-SfQLQb-suEOdc tB5Jxf-xl07Ob-XxIAqe-OWXEXe-oYxtQd \
                 roster-participants-search-input EmbeddedBrowserTabRootView fui-TreeItemPersonaLayout__main"
            ),
            None
        );
    }
}
