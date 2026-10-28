//! Cây UI Automation qua trait [`Tree`] (spec 2026-10-26-phan-biet-nguoi-noi §6.2, Windows; kế hoạch 05). Phần này thuần Rust, biên
//! dịch và test trên mọi nền tảng; lệnh UI Automation thật nằm sau trait [`UiaBackend`] (Windows: `reader::uia::ComBackend`).
//!
//! - Ánh xạ sang [`Attrs`] (QĐ 2 của kế hoạch 05): `role` = tên loại điều khiển, `subrole` = vai trò ARIA, `ident` =
//!   `AutomationId`, `classes` = các từ của `ClassName`, `title` = `Name`; `value` = `Name` khi là "Text" (chữ tĩnh, như
//!   `AXValue` của `AXStaticText` mà công thức Meet đọc). `desc` và `dom_id` để trống. Không đọc `HelpText`.
//! - Hình dạng (không chữ) và chữ đọc bằng hai lệnh riêng: hình dạng đi cùng lệnh lấy con (một lệnh cho cả danh sách con), chữ
//!   chỉ đọc khi bộ duyệt hỏi (QĐ 3 của kế hoạch 04: `Name` không nằm trong bộ nhớ đệm của hình dạng).
//! - Hình dạng của con đã có sẵn trong lượt đọc hiện tại thì [`Tree::shape`] không tốn lệnh nào (QĐ 3 của kế hoạch 05); sang lượt
//!   đọc mới ([`UiaTree::begin_pass`]) thì đọc lại, vì bộ đọc nhanh phải thấy trạng thái mới của ô và neo.

use speaker_recipe::Attrs;

use super::tree::Tree;

/// Chữ đọc được cắt ở chừng này ký tự (như bộ đọc macOS).
pub const MAX_TEXT_CHARS: usize = 300;
/// Số từ tối đa của `ClassName` (như `AXDOMClassList` của bộ đọc macOS).
pub const MAX_CLASS_TOKENS: usize = 32;

/// Lỗi của một lệnh UI Automation, đã phân loại.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UiaError {
    /// Quá hạn chờ: app họp treo hay bận.
    Timeout,
    /// Phần tử không còn (cửa sổ đóng, ô bị dựng lại, tiến trình thoát).
    Gone,
    /// Bị chặn: thường là app họp chạy với quyền cao hơn app này.
    Denied,
    Other,
}

/// Phân loại một mã `HRESULT` (viết dạng số không dấu) của UI Automation và COM.
pub fn classify_hresult(hr: u32) -> UiaError {
    match hr {
        // UIA_E_TIMEOUT, RPC_E_TIMEOUT.
        0x8013_1505 | 0x8001_011F => UiaError::Timeout,
        // UIA_E_ELEMENTNOTAVAILABLE, RPC_S_SERVER_UNAVAILABLE, RPC_S_CALL_FAILED, RPC_E_DISCONNECTED, RPC_E_SERVER_DIED.
        0x8004_0201 | 0x8007_06BA | 0x8007_06BE | 0x8001_0108 | 0x8001_0007 => UiaError::Gone,
        // E_ACCESSDENIED.
        0x8007_0005 => UiaError::Denied,
        _ => UiaError::Other,
    }
}

/// Hình dạng thô của một phần tử (không có chữ), đúng bốn thuộc tính bộ đọc lấy.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RawShape {
    pub control_type: i32,
    pub aria_role: String,
    pub automation_id: String,
    pub class_name: String,
}

/// Lệnh UI Automation mà bộ đọc dùng. Mỗi hàm là **một** lệnh qua tiến trình của app họp.
pub trait UiaBackend {
    type El: Clone;
    /// Hình dạng mới nhất của một phần tử.
    fn shape(&mut self, el: &Self::El) -> Result<RawShape, UiaError>;
    /// `Name` mới nhất của một phần tử.
    fn name(&mut self, el: &Self::El) -> Result<String, UiaError>;
    /// Các con trực tiếp, kèm hình dạng đọc cùng lệnh.
    fn children(&mut self, el: &Self::El) -> Result<Vec<(Self::El, RawShape)>, UiaError>;
}

/// Tên của một loại điều khiển UI Automation (`UIA_*ControlTypeId`, 50000–50040; đối chiếu với `windows` 0.62.2). Loại lạ: `Control<mã>`.
pub fn control_type_name(id: i32) -> String {
    const NAMES: [&str; 41] = [
        "Button",
        "Calendar",
        "CheckBox",
        "ComboBox",
        "Edit",
        "Hyperlink",
        "Image",
        "ListItem",
        "List",
        "Menu",
        "MenuBar",
        "MenuItem",
        "ProgressBar",
        "RadioButton",
        "ScrollBar",
        "Slider",
        "Spinner",
        "StatusBar",
        "Tab",
        "TabItem",
        "Text",
        "ToolBar",
        "ToolTip",
        "Tree",
        "TreeItem",
        "Custom",
        "Group",
        "Thumb",
        "DataGrid",
        "DataItem",
        "Document",
        "SplitButton",
        "Window",
        "Pane",
        "Header",
        "HeaderItem",
        "Table",
        "TitleBar",
        "Separator",
        "SemanticZoom",
        "AppBar",
    ];
    usize::try_from(id - 50_000)
        .ok()
        .and_then(|i| NAMES.get(i))
        .map_or_else(|| format!("Control{id}"), |n| (*n).to_string())
}

fn cut(s: &str) -> String {
    s.chars().take(MAX_TEXT_CHARS).collect()
}

/// [`RawShape`] thành [`Attrs`] không chữ.
pub fn attrs_of(raw: &RawShape) -> Attrs {
    Attrs {
        role: control_type_name(raw.control_type),
        subrole: cut(&raw.aria_role),
        ident: cut(&raw.automation_id),
        classes: raw
            .class_name
            .split_whitespace()
            .take(MAX_CLASS_TOKENS)
            .map(String::from)
            .collect(),
        ..Attrs::default()
    }
}

/// Một phần tử của cây. `shape` là hình dạng đã đọc sẵn cùng lệnh lấy con, kèm số thứ tự lượt đọc đó.
#[derive(Clone)]
pub struct UiaNode<E> {
    el: E,
    shape: Option<(u64, Attrs)>,
}

impl<E> UiaNode<E> {
    /// Phần tử chưa có hình dạng đọc sẵn (cửa sổ họp, phần tử từ `ElementFromHandle`).
    pub fn new(el: E) -> Self {
        Self { el, shape: None }
    }

    pub fn element(&self) -> &E {
        &self.el
    }
}

/// Cây UI Automation thật hay giả, qua [`UiaBackend`]. Đếm số lệnh và số lệnh lỗi trong lượt đọc hiện tại.
pub struct UiaTree<B: UiaBackend> {
    backend: B,
    epoch: u64,
    reads: u32,
    timeouts: u32,
    denied: u32,
}

impl<B: UiaBackend> UiaTree<B> {
    pub fn new(backend: B) -> Self {
        Self {
            backend,
            epoch: 0,
            reads: 0,
            timeouts: 0,
            denied: 0,
        }
    }

    pub fn backend(&self) -> &B {
        &self.backend
    }

    pub fn backend_mut(&mut self) -> &mut B {
        &mut self.backend
    }

    /// Bắt đầu một lượt đọc: hình dạng đọc sẵn của lượt trước hết hạn, đếm lại từ đầu.
    pub fn begin_pass(&mut self) {
        self.epoch += 1;
        self.reads = 0;
        self.timeouts = 0;
        self.denied = 0;
    }

    /// Số lệnh UI Automation đã gửi trong lượt này.
    pub fn reads(&self) -> u32 {
        self.reads
    }

    /// Số lệnh quá hạn chờ trong lượt này.
    pub fn timeouts(&self) -> u32 {
        self.timeouts
    }

    /// Số lệnh bị chặn trong lượt này.
    pub fn denied(&self) -> u32 {
        self.denied
    }

    fn note<T>(&mut self, r: Result<T, UiaError>) -> Option<T> {
        match r {
            Ok(v) => Some(v),
            Err(e) => {
                match e {
                    UiaError::Timeout => self.timeouts += 1,
                    UiaError::Denied => self.denied += 1,
                    UiaError::Gone | UiaError::Other => {}
                }
                None
            }
        }
    }

    fn fresh(&self, n: &UiaNode<B::El>) -> Option<Attrs> {
        n.shape
            .as_ref()
            .filter(|(epoch, _)| *epoch == self.epoch)
            .map(|(_, a)| a.clone())
    }
}

impl<B: UiaBackend> Tree for UiaTree<B> {
    type Node = UiaNode<B::El>;

    fn role(&mut self, n: &Self::Node) -> Option<String> {
        self.shape(n).map(|a| a.role)
    }

    fn shape(&mut self, n: &Self::Node) -> Option<Attrs> {
        if let Some(a) = self.fresh(n) {
            return Some(a);
        }
        self.reads += 1;
        let r = self.backend.shape(&n.el);
        self.note(r).map(|raw| attrs_of(&raw))
    }

    fn text(&mut self, n: &Self::Node, attrs: &mut Attrs) -> bool {
        self.reads += 1;
        let r = self.backend.name(&n.el);
        let Some(name) = self.note(r) else { return false };
        let name = cut(&name);
        if attrs.role == "Text" {
            attrs.value.clone_from(&name);
        }
        attrs.title = name;
        true
    }

    fn children(&mut self, n: &Self::Node) -> Vec<Self::Node> {
        self.reads += 1;
        let r = self.backend.children(&n.el);
        let epoch = self.epoch;
        self.note(r)
            .unwrap_or_default()
            .into_iter()
            .map(|(el, raw)| UiaNode {
                el,
                shape: Some((epoch, attrs_of(&raw))),
            })
            .collect()
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Phần tử giả: hình dạng, `Name` và con.
    pub(crate) struct FakeNode {
        pub shape: RawShape,
        pub name: String,
        pub kids: Vec<usize>,
    }

    /// Backend giả: một cây trong bộ nhớ, đếm từng loại lệnh, tiêm lỗi.
    #[derive(Default)]
    pub(crate) struct Fake {
        pub nodes: Vec<FakeNode>,
        pub shape_calls: u32,
        pub name_calls: u32,
        pub children_calls: u32,
        pub fail: Option<UiaError>,
    }

    impl Fake {
        pub fn add(
            &mut self,
            parent: Option<usize>,
            control_type: i32,
            aria: &str,
            id: &str,
            class: &str,
            name: &str,
        ) -> usize {
            let i = self.nodes.len();
            self.nodes.push(FakeNode {
                shape: RawShape {
                    control_type,
                    aria_role: aria.into(),
                    automation_id: id.into(),
                    class_name: class.into(),
                },
                name: name.into(),
                kids: Vec::new(),
            });
            if let Some(p) = parent {
                self.nodes[p].kids.push(i);
            }
            i
        }
    }

    impl UiaBackend for Fake {
        type El = usize;

        fn shape(&mut self, el: &usize) -> Result<RawShape, UiaError> {
            self.shape_calls += 1;
            if let Some(e) = self.fail {
                return Err(e);
            }
            Ok(self.nodes[*el].shape.clone())
        }

        fn name(&mut self, el: &usize) -> Result<String, UiaError> {
            self.name_calls += 1;
            if let Some(e) = self.fail {
                return Err(e);
            }
            Ok(self.nodes[*el].name.clone())
        }

        fn children(&mut self, el: &usize) -> Result<Vec<(usize, RawShape)>, UiaError> {
            self.children_calls += 1;
            if let Some(e) = self.fail {
                return Err(e);
            }
            Ok(self.nodes[*el]
                .kids
                .iter()
                .map(|&k| (k, self.nodes[k].shape.clone()))
                .collect())
        }
    }

    const GROUP: i32 = 50026;
    const TEXT: i32 = 50020;
    const MENU_ITEM: i32 = 50011;

    #[test]
    fn control_types_have_names() {
        assert_eq!(control_type_name(50000), "Button");
        assert_eq!(control_type_name(MENU_ITEM), "MenuItem");
        assert_eq!(control_type_name(GROUP), "Group");
        assert_eq!(control_type_name(TEXT), "Text");
        assert_eq!(control_type_name(50030), "Document");
        assert_eq!(control_type_name(50032), "Window");
        assert_eq!(control_type_name(50040), "AppBar");
        assert_eq!(control_type_name(50041), "Control50041");
        assert_eq!(control_type_name(0), "Control0");
        assert_eq!(control_type_name(-5), "Control-5");
    }

    /// Mã lỗi COM và UI Automation thường gặp (kiểm với `windows` 0.62.2: `UIA_E_TIMEOUT` 2148734213, `UIA_E_ELEMENTNOTAVAILABLE`
    /// 2147746305, `E_ACCESSDENIED` 0x80070005).
    #[test]
    fn hresults_are_classified() {
        assert_eq!(classify_hresult(2_148_734_213), UiaError::Timeout);
        assert_eq!(classify_hresult(0x8001_011F), UiaError::Timeout);
        assert_eq!(classify_hresult(2_147_746_305), UiaError::Gone);
        assert_eq!(classify_hresult(0x8007_06BA), UiaError::Gone);
        assert_eq!(classify_hresult(0x8007_0005), UiaError::Denied);
        assert_eq!(classify_hresult(0x8000_4005), UiaError::Other);
        assert_eq!(classify_hresult(0), UiaError::Other);
    }

    #[test]
    fn raw_shapes_become_attrs_without_text() {
        let raw = RawShape {
            control_type: GROUP,
            aria_role: "menuitem".into(),
            automation_id: "call-duration".into(),
            class_name: "fui-Flex  vdi-frame-occlusion ".into(),
        };
        let a = attrs_of(&raw);
        assert_eq!(
            (a.role.as_str(), a.subrole.as_str(), a.ident.as_str()),
            ("Group", "menuitem", "call-duration")
        );
        assert_eq!(a.classes, ["fui-Flex", "vdi-frame-occlusion"]);
        assert!(a.dom_id.is_empty() && !a.has_text());
        let many = RawShape {
            class_name: (0..40).map(|i| format!("c{i}")).collect::<Vec<_>>().join(" "),
            ..RawShape::default()
        };
        assert_eq!(attrs_of(&many).classes.len(), MAX_CLASS_TOKENS);
    }

    /// QĐ 3: hình dạng của con đi cùng lệnh lấy con, đọc lại trong cùng lượt không tốn lệnh; sang lượt mới thì đọc lại.
    #[test]
    fn child_shapes_come_with_the_children_command_within_a_pass() {
        let mut f = Fake::default();
        let root = f.add(None, 50032, "", "", "", "");
        let a = f.add(Some(root), MENU_ITEM, "menuitem", "", "fui-Flex", "Lan");
        f.add(Some(root), GROUP, "", "", "", "");
        let mut t = UiaTree::new(f);
        t.begin_pass();
        let kids = t.children(&UiaNode::new(root));
        assert_eq!(kids.len(), 2);
        assert_eq!(t.reads(), 1);
        assert_eq!(t.shape(&kids[0]).unwrap().role, "MenuItem");
        assert_eq!(t.role(&kids[1]).as_deref(), Some("Group"));
        assert_eq!((t.reads(), t.backend().shape_calls), (1, 0), "không lệnh nào thêm");
        t.begin_pass();
        assert_eq!(t.reads(), 0);
        assert_eq!(t.shape(&kids[0]).unwrap().classes, ["fui-Flex"]);
        assert_eq!((t.reads(), t.backend().shape_calls), (1, 1), "lượt mới đọc lại");
        assert_eq!(t.backend().nodes[a].name, "Lan");
    }

    /// Chữ chỉ đọc khi được hỏi; "Text" cho cả `value` (như `AXValue` của chữ tĩnh); cắt ở 300 ký tự.
    #[test]
    fn names_are_read_on_demand_and_static_text_has_a_value() {
        let mut f = Fake::default();
        let root = f.add(None, 50032, "", "", "", "");
        f.add(Some(root), TEXT, "", "", "", &"ạ".repeat(500));
        f.add(Some(root), MENU_ITEM, "", "", "", "Minh, muted");
        let mut t = UiaTree::new(f);
        t.begin_pass();
        let kids = t.children(&UiaNode::new(root));
        assert_eq!(t.backend().name_calls, 0, "lấy con không đọc chữ");
        let mut a = t.shape(&kids[0]).unwrap();
        assert!(t.text(&kids[0], &mut a));
        assert_eq!(
            (a.title.chars().count(), a.value.chars().count()),
            (MAX_TEXT_CHARS, MAX_TEXT_CHARS)
        );
        let mut b = t.shape(&kids[1]).unwrap();
        assert!(t.text(&kids[1], &mut b));
        assert_eq!(
            (b.title.as_str(), b.value.as_str(), b.label()),
            ("Minh, muted", "", "Minh, muted")
        );
        assert_eq!(t.backend().name_calls, 2);
    }

    /// Lệnh lỗi thì không có kết quả; quá hạn chờ và bị chặn được đếm riêng cho lượt này.
    #[test]
    fn failing_commands_are_counted() {
        let mut f = Fake::default();
        let root = f.add(None, 50032, "", "", "", "");
        f.add(Some(root), GROUP, "", "", "", "");
        let mut t = UiaTree::new(f);
        t.begin_pass();
        let node = UiaNode::new(root);
        t.backend_mut().fail = Some(UiaError::Timeout);
        assert!(t.shape(&node).is_none() && t.children(&node).is_empty());
        assert!(!t.text(&node, &mut Attrs::default()));
        t.backend_mut().fail = Some(UiaError::Denied);
        assert!(t.shape(&node).is_none());
        t.backend_mut().fail = Some(UiaError::Gone);
        assert!(t.shape(&node).is_none());
        assert_eq!((t.reads(), t.timeouts(), t.denied()), (5, 3, 1));
        t.begin_pass();
        assert_eq!((t.reads(), t.timeouts(), t.denied()), (0, 0, 0));
    }

    // ---- Đường đọc Windows từ đầu tới cuối trên cây TỔNG HỢP (không phải bản ghi thật) ----

    fn windows_recipes(file: &str) -> speaker_recipe::Recipes {
        let path = crate::reader::tree::tests::fixture_path(file);
        let r = speaker_recipe::parse(&std::fs::read_to_string(path).unwrap()).unwrap();
        assert!(r.dropped.is_empty(), "{file}: {:?}", r.dropped);
        r
    }

    /// Cây giống Teams (suy từ bản ghi macOS: ô video là `MenuItem` mang nhãn, khung đang nói là con `Group` có lớp
    /// `vdi-frame-occlusion`, nút rời cuộc gọi có id `hangup-button`). **Tổng hợp**: tên lớp, vai trò, id trên Windows chưa có bản
    /// ghi thật (kế hoạch 05 Task 11); test này chỉ kiểm đường ống: ánh xạ, bộ duyệt chung, lệnh đọc.
    struct TeamsLike {
        fake: Fake,
        root: usize,
        lan: usize,
        hangup: usize,
    }

    fn teams_like() -> TeamsLike {
        let mut f = Fake::default();
        let root = f.add(None, 50032, "", "", "", "");
        let pane = f.add(Some(root), 50033, "", "", "", "");
        let hangup = f.add(Some(pane), 50000, "button", "hangup-button", "fui-Button", "Leave");
        let lan = f.add(
            Some(pane),
            MENU_ITEM,
            "menuitem",
            "",
            "fui-Flex",
            "Lan (Guest), Context menu is available",
        );
        f.add(Some(lan), GROUP, "", "", "fui-Flex vdi-frame-occlusion", "");
        f.add(
            Some(pane),
            MENU_ITEM,
            "menuitem",
            "",
            "fui-Flex",
            "Minh (Guest), muted, Context menu is available",
        );
        f.add(
            Some(pane),
            MENU_ITEM,
            "menuitem",
            "",
            "fui-Flex",
            "Myself video, Hoa Phạm, Muted, Has context menu",
        );
        TeamsLike {
            fake: f,
            root,
            lan,
            hangup,
        }
    }

    #[test]
    fn a_teams_like_uia_tree_gives_names_mics_the_user_and_the_speaking_frame() {
        use crate::reader::extract::{Budget, Walk, sample_round};
        use speaker_recipe::{MeetingApp, Os};
        let recipes = windows_recipes("teams-windows.recipes.json");
        let app = recipes.app(Os::Windows, MeetingApp::Teams).unwrap();
        let TeamsLike { fake, root, lan, .. } = teams_like();
        let mut t = UiaTree::new(fake);
        t.begin_pass();
        let tiles = Walk::new(UiaNode::new(root), 0, app.web_only)
            .step(&mut t, app, &mut Budget::unlimited())
            .unwrap();
        assert_eq!(tiles.len(), 3);
        assert_eq!(t.backend().name_calls, 3, "chữ chỉ đọc ở ba ô, không đọc nút hay khung");
        let samples = |t: &mut UiaTree<Fake>| {
            t.begin_pass();
            let round = sample_round(t, &tiles, app, 0, false, &mut Budget::unlimited());
            assert!(!round.gone);
            round.samples
        };
        let s = samples(&mut t);
        let view: Vec<_> = s
            .iter()
            .map(|x| (x.name.as_str(), x.is_self, x.muted, x.anchors.clone()))
            .collect();
        assert_eq!(
            view,
            [
                ("Lan", false, Some(false), vec![Some(1)]),
                ("Minh", false, Some(true), vec![None]),
                ("Hoa Phạm", true, Some(true), vec![None]),
            ]
        );
        // Khung đang nói biến mất: lượt đọc nhanh kế tiếp thấy ngay (hình dạng đọc lại ở lượt mới).
        t.backend_mut().nodes[lan].kids.clear();
        let s = samples(&mut t);
        assert_eq!(s[0].anchors, [None]);
    }

    /// Ba công thức ứng viên cho Windows (đoán từ bản ghi macOS, chưa có bản ghi Windows nào) phải hợp lệ, mỗi mục đúng app và hệ điều hành.
    #[test]
    fn the_candidate_windows_recipes_are_valid() {
        use speaker_recipe::{MeetingApp, Os};
        for (file, apps) in [
            ("teams-windows.recipes.json", vec![MeetingApp::Teams]),
            (
                "meet-windows.recipes.json",
                vec![MeetingApp::MeetChrome, MeetingApp::MeetEdge],
            ),
            ("zoom-windows-explore.recipes.json", vec![MeetingApp::Zoom]),
        ] {
            let r = windows_recipes(file);
            assert!(!r.has_os(Os::Macos), "{file}");
            for app in apps {
                assert!(r.app(Os::Windows, app).is_some(), "{file}: {app:?}");
            }
        }
    }

    /// Không có nút rời cuộc gọi thì không phải cửa sổ họp: không ô nào (như macOS).
    #[test]
    fn without_the_hangup_button_the_window_is_not_a_meeting() {
        use crate::reader::extract::{Budget, Walk};
        use speaker_recipe::{MeetingApp, Os};
        let recipes = windows_recipes("teams-windows.recipes.json");
        let app = recipes.app(Os::Windows, MeetingApp::Teams).unwrap();
        let TeamsLike {
            mut fake, root, hangup, ..
        } = teams_like();
        fake.nodes[hangup].shape.automation_id = "other-button".into();
        let mut t = UiaTree::new(fake);
        t.begin_pass();
        let tiles = Walk::new(UiaNode::new(root), 0, app.web_only)
            .step(&mut t, app, &mut Budget::unlimited())
            .unwrap();
        assert!(tiles.is_empty());
    }

    /// Trình duyệt: chỉ vào vùng web (`Document`) có tên khớp tiêu đề Meet; bên ngoài (thẻ, thanh địa chỉ) chỉ đọc vai trò.
    #[test]
    fn meet_like_tree_reads_text_only_inside_the_matching_document() {
        use crate::reader::extract::{Budget, Walk};
        use speaker_recipe::{MeetingApp, Os};
        let recipes = windows_recipes("meet-windows.recipes.json");
        let app = recipes.app(Os::Windows, MeetingApp::MeetChrome).unwrap();
        let mut f = Fake::default();
        let root = f.add(None, 50032, "", "", "", "");
        f.add(Some(root), 50000, "", "", "", "Dấu trang riêng");
        let meet = f.add(Some(root), 50030, "", "", "", "Meet - abc-defg-hij");
        let tile = f.add(Some(meet), GROUP, "", "", "oZRSLe", "");
        f.add(Some(tile), GROUP, "", "", "DYfzY cYKTje", "");
        f.add(Some(tile), GROUP, "", "", "qg7mD KXY1yb", "");
        f.add(Some(tile), TEXT, "", "", "", "Lan Nguyễn");
        let gmail = f.add(Some(root), 50030, "", "", "", "Gmail - Hộp thư");
        f.add(Some(gmail), TEXT, "", "", "", "thư riêng");
        let mut t = UiaTree::new(f);
        t.begin_pass();
        let tiles = Walk::new(UiaNode::new(root), 0, app.web_only)
            .step(&mut t, app, &mut Budget::unlimited())
            .unwrap();
        assert_eq!(
            tiles.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(),
            ["Lan Nguyễn"]
        );
        // Tên đọc: hai vùng web (để so tiêu đề) và chữ tên trong ô; không đọc dấu trang hay thư.
        assert_eq!(t.backend().name_calls, 3);
    }
}
