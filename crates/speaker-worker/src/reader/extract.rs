//! Duyệt cửa sổ họp, tìm ô người tham dự và phần tử neo, lấy mẫu từng ô (spec §6.2–§6.4), viết một lần cho mọi [`Tree`].
//!
//! - Ngân sách ([`Budget`], QĐ 13): ≤ [`MAX_ELEMENTS`] lệnh đọc (mỗi lần gọi [`Tree`]) và ≤ [`PASS_BUDGET`] cho **cả lượt**: duyệt
//!   cửa sổ, lấy mẫu ô, đọc trong ô, tìm neo, ứng viên. Mọi lệnh đi qua [`Metered`]; hết ngân sách thì phần đang đọc dở bị bỏ.
//! - Lượt đầy đủ ([`Walk`]): duyệt theo chiều sâu; hết ngân sách thì dừng, lượt sau đi tiếp từ phần tử chưa duyệt. Tìm ô (phần tử
//!   khớp `tile` của công thức), tên của ô, phần tử neo của tín hiệu đổi trạng thái.
//! - Lượt nhanh ([`sample_round`], [`sample_tile`]): đọc lại nhãn ô, chữ tên (Meet), các neo đã biết; tín hiệu "có mặt" tìm lại neo
//!   trong con của ô. Hết ngân sách thì lượt sau đọc tiếp từ ô chưa đọc (xoay vòng).
//! - Chữ chỉ đọc ở tiêu đề vùng web, phần tử khớp hình dạng của ô, bên trong ô (QĐ 3 của kế hoạch 04). Không gì ngoài tên, mic,
//!   chữ "đang nói" và trạng thái neo ra khỏi module này (spec §6.3).

use std::collections::VecDeque;
use std::collections::hash_map::DefaultHasher;
use std::fmt;
use std::hash::{Hash, Hasher};
use std::time::{Duration, Instant};

use speaker_recipe::{Anchor, AppRecipe, Attrs, NameFrom, Scope, SignalKind, is_self_name, tidy_name};

use super::tree::Tree;

/// Giới hạn mỗi lượt (spec §6.2: 3 000 phần tử), đếm theo lệnh đọc: mỗi phần tử tốn ít nhất một lệnh nên chặt hơn.
pub const MAX_ELEMENTS: u32 = 3_000;
pub const PASS_BUDGET: Duration = Duration::from_millis(30);
pub const MAX_TILES: usize = 32;
/// Số phần tử tối đa đọc bên trong một ô (tìm tên, neo, ứng viên).
pub const MAX_TILE_NODES: usize = 64;
pub const MAX_DEPTH: u32 = 64;
/// Ứng viên tự hiệu chỉnh tối đa mỗi ô (spec §6.5).
pub const MAX_CANDIDATES: usize = 16;
/// Ứng viên nằm trong ô, sâu tối đa chừng này.
const CANDIDATE_DEPTH: usize = 4;
/// Số lớp giữ lại trong mô tả một ứng viên (`CandidateShape::classes`).
const MAX_SHAPE_CLASSES: usize = 8;

/// Ngân sách của một lượt đọc: số lệnh đọc và thời gian.
pub struct Budget {
    left: u32,
    deadline: Option<Instant>,
    used: u32,
    exhausted: bool,
}

impl Budget {
    pub fn new(reads: u32, time: Duration) -> Self {
        Self {
            left: reads,
            deadline: Some(Instant::now() + time),
            used: 0,
            exhausted: false,
        }
    }

    pub fn unlimited() -> Self {
        Self {
            left: u32::MAX,
            deadline: None,
            used: 0,
            exhausted: false,
        }
    }

    /// Trừ một lệnh đọc; `false` (và từ đó [`Budget::exhausted`]) khi hết lệnh hay hết giờ.
    pub fn take(&mut self) -> bool {
        if self.exhausted || self.left == 0 || self.deadline.is_some_and(|d| Instant::now() >= d) {
            self.exhausted = true;
            return false;
        }
        self.left -= 1;
        self.used += 1;
        true
    }

    pub fn used(&self) -> u32 {
        self.used
    }

    pub fn exhausted(&self) -> bool {
        self.exhausted
    }
}

/// Cây đọc qua ngân sách: mỗi lệnh trừ một đơn vị; hết thì trả rỗng, người gọi xem [`Budget::exhausted`] để bỏ phần đọc dở.
struct Metered<'a, T: Tree> {
    tree: &'a mut T,
    budget: &'a mut Budget,
}

impl<T: Tree> Tree for Metered<'_, T> {
    type Node = T::Node;

    fn role(&mut self, n: &T::Node) -> Option<String> {
        if self.budget.take() { self.tree.role(n) } else { None }
    }

    fn shape(&mut self, n: &T::Node) -> Option<Attrs> {
        if self.budget.take() { self.tree.shape(n) } else { None }
    }

    fn text(&mut self, n: &T::Node, a: &mut Attrs) -> bool {
        self.budget.take() && self.tree.text(n, a)
    }

    fn children(&mut self, n: &T::Node) -> Vec<T::Node> {
        if self.budget.take() {
            self.tree.children(n)
        } else {
            Vec::new()
        }
    }
}

/// Một ô tìm được ở lượt đầy đủ: phần tử của ô, tên (đã làm gọn), có phải chính người dùng, neo của từng tín hiệu (chỉ tín hiệu
/// đổi trạng thái; tín hiệu "có mặt" tìm lại mỗi lượt).
#[derive(Clone)]
pub struct TileRef<N> {
    pub node: N,
    pub name: String,
    pub is_self: bool,
    pub anchors: Vec<Option<N>>,
    /// Vị trí của ô: thứ tự cửa sổ × 256 + thứ tự trong các ô cùng tên của cửa sổ đó (khóa lịch sử theo từng ô, QĐ 23).
    pub slot: u32,
    /// Phần tử chữ tên (Meet, `NameFrom::Text`): lượt nhanh đọc lại chữ này mỗi lần.
    pub name_node: Option<N>,
}

/// Mô tả một ứng viên tự hiệu chỉnh ở một trạng thái (kế hoạch 06, spec §7.2): vai trò, vị trí trong ô, vai trò phụ và các lớp. **Không
/// có chữ** (không tên, không nhãn): để báo cáo tình trạng mô tả chỉ báo tự học cho người cập nhật công thức.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CandidateShape {
    /// Khóa vị trí và trạng thái, như trong [`TileSample::candidates`].
    pub key: u64,
    pub state: u64,
    pub role: String,
    pub path: Vec<u16>,
    pub subrole: String,
    pub classes: Vec<String>,
}

/// Mẫu của một ô ở một lượt đọc: đúng những gì ra khỏi bộ đọc (spec §6.3).
#[derive(Clone, PartialEq)]
pub struct TileSample {
    pub name: String,
    pub is_self: bool,
    pub muted: Option<bool>,
    /// Tín hiệu 1: nhóm `speaking` của nhãn ô không rỗng.
    pub label_speaking: bool,
    /// Theo thứ tự `speaking` của công thức: trạng thái neo (`Some(1)`: có mặt; tín hiệu đổi trạng thái: băm của vai trò và lớp);
    /// `None`: không có hay không đọc được.
    pub anchors: Vec<Option<u64>>,
    /// Chỉ khi tự hiệu chỉnh: (khóa vị trí trong ô, trạng thái) của tối đa [`MAX_CANDIDATES`] phần tử không có chữ.
    pub candidates: Vec<(u64, u64)>,
    /// Mô tả của các ứng viên trên (cùng lúc, cùng thứ tự); chỉ để mô tả chỉ báo tự học trong báo cáo tình trạng.
    pub shapes: Vec<CandidateShape>,
    /// Như [`TileRef::slot`].
    pub slot: u32,
    /// Nguồn (mục công thức) đã đọc ra ô này, theo thứ tự trong file; `anchors` theo `speaking` của chính nguồn đó. Chỉ Windows có
    /// nhiều nguồn một app (bảng người tham dự, phụ đề); nơi khác luôn 0.
    pub variant: u8,
}

// Debug viết tay: tên không vào log.
impl fmt::Debug for TileSample {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TileSample")
            .field("name", &format_args!("<{} ký tự>", self.name.chars().count()))
            .field("is_self", &self.is_self)
            .field("muted", &self.muted)
            .field("label_speaking", &self.label_speaking)
            .field("anchors", &self.anchors)
            .field("candidates", &self.candidates.len())
            .field("shapes", &self.shapes.len())
            .field("slot", &self.slot)
            .field("variant", &self.variant)
            .finish()
    }
}

/// Cửa sổ có phải cửa sổ họp của app không (spec §6.1): id khớp `window_id`, tiêu đề khớp một mẫu, hay (macOS) AXSubrole khớp một
/// mẫu `window_subrole` (cuộc họp có tên tự đặt: tiêu đề cửa sổ là tên cuộc họp). Luật vai trò phụ chỉ cho cửa sổ ứng viên; bộ đọc
/// vẫn chỉ lấy tên khi thấy phần tử `confirm_id` trong cửa sổ (`Walk::step`). Windows truyền `subrole` rỗng.
pub fn is_meeting_window(app: &AppRecipe, title: &str, ident: &str, subrole: &str) -> bool {
    app.window_id.as_ref().is_some_and(|re| re.is_match(ident))
        || app.window_title.iter().any(|re| re.is_match(title))
        || (!subrole.is_empty() && app.window_subrole.iter().any(|re| re.is_match(subrole)))
}

/// Lượt đầy đủ trên một cửa sổ họp, dừng được giữa chừng.
pub struct Walk<N> {
    /// (phần tử, độ sâu, đã ở trong vùng được đọc chữ chưa).
    stack: Vec<(N, u32, bool)>,
    tiles: Vec<TileRef<N>>,
    confirmed: bool,
    window: u32,
}

impl<N: Clone> Walk<N> {
    /// Đã thấy phần tử `confirm_id` trong cửa sổ (đúng sau khi `step` trả `Some`).
    pub fn confirmed(&self) -> bool {
        self.confirmed
    }

    /// `window`: thứ tự của cửa sổ họp trong lượt đọc (phần cửa sổ của [`TileRef::slot`]).
    pub fn new(node: N, window: u32, web_only: bool) -> Self {
        Self {
            stack: vec![(node, 0, !web_only)],
            tiles: Vec::new(),
            confirmed: false,
            window,
        }
    }

    /// Đi tiếp trong ngân sách; `Some(ô)` khi đã duyệt xong cả cửa sổ. Phần tử đọc dở lúc hết ngân sách được đọc lại từ đầu ở lượt
    /// sau; phần tử đầu tiên của lượt mà tự nó vượt cả phần ngân sách còn lại thì bị bỏ qua (không kẹt mãi ở nó).
    pub fn step<T: Tree<Node = N>>(
        &mut self,
        t: &mut T,
        app: &AppRecipe,
        budget: &mut Budget,
    ) -> Option<Vec<TileRef<N>>> {
        let mut visited = 0u32;
        while let Some(entry) = self.stack.pop() {
            if budget.exhausted() {
                self.stack.push(entry);
                return None;
            }
            let mark = (self.stack.len(), self.tiles.len(), self.confirmed);
            self.visit(
                &mut Metered {
                    tree: &mut *t,
                    budget: &mut *budget,
                },
                app,
                entry.clone(),
            );
            if budget.exhausted() {
                self.stack.truncate(mark.0);
                self.tiles.truncate(mark.1);
                self.confirmed = mark.2;
                if visited > 0 {
                    self.stack.push(entry);
                }
                return None;
            }
            visited += 1;
        }
        let tiles = std::mem::take(&mut self.tiles);
        Some(if app.confirm_id.is_some() && !self.confirmed {
            Vec::new()
        } else {
            tiles
        })
    }

    fn visit<T: Tree<Node = N>>(&mut self, t: &mut T, app: &AppRecipe, (node, depth, inside): (N, u32, bool)) {
        if depth > MAX_DEPTH {
            return;
        }
        if !inside {
            // Ngoài vùng web của trình duyệt: chỉ đọc vai trò (QĐ 3); chỉ vào vùng web có tiêu đề khớp.
            if t.role(&node).as_deref() == Some(app.os.web_role()) {
                let mut a = Attrs::default();
                if t.text(&node, &mut a) && app.window_title.iter().any(|re| re.is_match(&a.title)) {
                    for c in t.children(&node).into_iter().rev() {
                        self.stack.push((c, depth + 1, true));
                    }
                }
                return;
            }
            for c in t.children(&node).into_iter().rev() {
                self.stack.push((c, depth + 1, false));
            }
            return;
        }
        let Some(mut a) = t.shape(&node) else { return };
        if app
            .confirm_id
            .as_ref()
            .is_some_and(|id| a.ident == *id || a.dom_id == *id)
        {
            self.confirmed = true;
        }
        if self.tiles.len() < MAX_TILES && app.tile.matches_shape(&a) {
            if app.tile.needs_text() {
                t.text(&node, &mut a);
            }
            if app.tile.matches(&a) {
                if let Some(mut tile) = tile_ref(t, node, &a, app) {
                    let same = self.tiles.iter().filter(|x| x.name == tile.name).count().min(255) as u32;
                    tile.slot = self.window * 256 + same;
                    self.tiles.push(tile);
                }
                return;
            }
        }
        for c in t.children(&node).into_iter().rev() {
            self.stack.push((c, depth + 1, true));
        }
    }
}

fn tile_ref<T: Tree>(t: &mut T, node: T::Node, a: &Attrs, app: &AppRecipe) -> Option<TileRef<T::Node>> {
    let caps = app.tile.label.as_ref().and_then(|re| re.captures(a.label()));
    let (raw, name_node) = match app.name_from {
        NameFrom::Label => (caps.as_ref()?.name("name")?.as_str().to_string(), None),
        NameFrom::Text => {
            let (n, text) = first_text(t, &node, app.os.static_text_role())?;
            (text, Some(n))
        }
    };
    let label_self = caps.as_ref().is_some_and(|c| c.name("self").is_some());
    let is_self = label_self || is_self_name(&raw, app);
    let name = tidy_name(&raw, app)?;
    let anchors = app
        .speaking
        .iter()
        .map(|s| match (s.kind, &s.anchor) {
            (SignalKind::Flicker | SignalKind::Deviation, Some(an)) => find_anchor(t, &node, an),
            _ => None,
        })
        .collect();
    Some(TileRef {
        node,
        name,
        is_self,
        anchors,
        slot: 0,
        name_node,
    })
}

/// Phần tử neo đầu tiên trong ô (theo chiều rộng), chỉ đọc hình dạng.
fn find_anchor<T: Tree>(t: &mut T, tile: &T::Node, anchor: &Anchor) -> Option<T::Node> {
    let depth = if anchor.scope == Scope::Child {
        1
    } else {
        anchor.max_depth
    };
    let mut queue: VecDeque<(T::Node, u32)> = t.children(tile).into_iter().map(|c| (c, 1)).collect();
    let mut seen = 0;
    while let Some((n, d)) = queue.pop_front() {
        seen += 1;
        if seen > MAX_TILE_NODES {
            break;
        }
        if t.shape(&n).is_some_and(|a| anchor.matcher.matches_shape(&a)) {
            return Some(n);
        }
        if d < depth {
            queue.extend(t.children(&n).into_iter().map(|c| (c, d + 1)));
        }
    }
    None
}

/// Chữ tĩnh đầu tiên trong ô (tên của ô Meet) và phần tử chứa nó.
fn first_text<T: Tree>(t: &mut T, tile: &T::Node, static_text: &str) -> Option<(T::Node, String)> {
    let mut stack: Vec<T::Node> = t.children(tile).into_iter().rev().collect();
    let mut seen = 0;
    while let Some(n) = stack.pop() {
        seen += 1;
        if seen > MAX_TILE_NODES {
            break;
        }
        let Some(mut a) = t.shape(&n) else { continue };
        if a.role == static_text && t.text(&n, &mut a) && !a.value.trim().is_empty() {
            return Some((n, a.value));
        }
        stack.extend(t.children(&n).into_iter().rev());
    }
    None
}

/// Trạng thái của một phần tử neo hay ứng viên: băm của vai trò, vai trò phụ, lớp (không có chữ).
fn state_of(a: &Attrs) -> u64 {
    let mut h = DefaultHasher::new();
    (&a.role, &a.subrole, &a.classes).hash(&mut h);
    h.finish()
}

/// Trạng thái của một dòng phụ đề: băm các chữ tĩnh trong ô (tên người nói và lời). Đổi khi Teams nối thêm chữ vào dòng. **Chỉ băm, không
/// giữ chữ** (lời họp không ra khỏi bộ đọc).
fn caption_state<T: Tree>(t: &mut T, tile: &T::Node, static_text: &str) -> u64 {
    let mut h = DefaultHasher::new();
    let mut stack: Vec<T::Node> = t.children(tile).into_iter().rev().collect();
    let mut seen = 0;
    while let Some(n) = stack.pop() {
        seen += 1;
        if seen > MAX_TILE_NODES {
            break;
        }
        let Some(mut a) = t.shape(&n) else { continue };
        if a.role == static_text && t.text(&n, &mut a) {
            a.value.hash(&mut h);
            a.title.hash(&mut h);
        }
        stack.extend(t.children(&n).into_iter().rev());
    }
    h.finish()
}

/// Ứng viên tự hiệu chỉnh (spec §6.5): phần tử không có chữ trong ô, khóa là vị trí (chỉ số con theo đường đi) và vai trò.
fn candidates<T: Tree>(t: &mut T, tile: &T::Node) -> (Vec<(u64, u64)>, Vec<CandidateShape>) {
    let mut out = Vec::new();
    let mut shapes = Vec::new();
    let mut queue: VecDeque<(T::Node, Vec<u16>)> = t
        .children(tile)
        .into_iter()
        .enumerate()
        .map(|(i, c)| (c, vec![i as u16]))
        .collect();
    let mut seen = 0;
    while let Some((n, path)) = queue.pop_front() {
        seen += 1;
        if seen > MAX_TILE_NODES || out.len() >= MAX_CANDIDATES {
            break;
        }
        let Some(mut a) = t.shape(&n) else { continue };
        if !t.text(&n, &mut a) {
            continue;
        }
        if !a.has_text() {
            let mut h = DefaultHasher::new();
            (&path, &a.role).hash(&mut h);
            let (key, state) = (h.finish(), state_of(&a));
            out.push((key, state));
            shapes.push(CandidateShape {
                key,
                state,
                role: a.role.clone(),
                path: path.clone(),
                subrole: a.subrole.clone(),
                classes: a.classes.iter().take(MAX_SHAPE_CLASSES).cloned().collect(),
            });
        }
        if path.len() < CANDIDATE_DEPTH {
            for (i, c) in t.children(&n).into_iter().enumerate() {
                let mut p = path.clone();
                p.push(i as u16);
                queue.push_back((c, p));
            }
        }
    }
    (out, shapes)
}

/// Kết quả lấy mẫu một ô ở lượt nhanh.
#[derive(Debug)]
pub enum TileRead {
    Sample(TileSample),
    /// Ô không còn: lượt sau duyệt lại cả cửa sổ.
    Gone,
    /// Hết ngân sách giữa chừng: bỏ phần đọc dở, lượt sau đọc lại ô này.
    OutOfBudget,
}

/// Lượt nhanh của một ô: nhãn (tên, mic, chữ "đang nói"), chữ tên (Meet), trạng thái neo, và ứng viên khi `calibrate`; mọi lệnh
/// đọc trừ vào `budget`.
pub fn sample_tile<T: Tree>(
    t: &mut T,
    tile: &TileRef<T::Node>,
    app: &AppRecipe,
    calibrate: bool,
    budget: &mut Budget,
) -> TileRead {
    let read = read_tile(
        &mut Metered {
            tree: t,
            budget: &mut *budget,
        },
        tile,
        app,
        calibrate,
    );
    if budget.exhausted() {
        return TileRead::OutOfBudget;
    }
    read.map_or(TileRead::Gone, TileRead::Sample)
}

fn read_tile<T: Tree>(t: &mut T, tile: &TileRef<T::Node>, app: &AppRecipe, calibrate: bool) -> Option<TileSample> {
    let mut a = t.shape(&tile.node)?;
    if app.tile.needs_text() && !t.text(&tile.node, &mut a) {
        return None;
    }
    let caps = app.tile.label.as_ref().and_then(|re| re.captures(a.label()));
    let (name, is_self) = match app.name_from {
        NameFrom::Label => {
            let raw = caps.as_ref()?.name("name")?.as_str();
            let label_self = caps.as_ref().is_some_and(|c| c.name("self").is_some());
            (tidy_name(raw, app)?, label_self || is_self_name(raw, app))
        }
        NameFrom::Text => {
            // Đọc lại chữ tên mỗi lượt (rà soát A-NHỎ 8): Meet sắp lại ô hay dùng lại phần tử thì trạng thái neo không bị gán cho
            // tên cũ tới lượt đầy đủ sau.
            let n = tile.name_node.as_ref()?;
            let mut na = t.shape(n)?;
            if !t.text(n, &mut na) {
                return None;
            }
            (tidy_name(&na.value, app)?, is_self_name(&na.value, app))
        }
    };
    let muted = app
        .mic
        .as_ref()
        .and_then(|m| match caps.as_ref().and_then(|c| c.name("muted")) {
            Some(v) => Some(m.muted_values.iter().any(|x| x == v.as_str())),
            None => m.absent_means_unmuted.then_some(false),
        });
    let label_speaking = caps
        .as_ref()
        .and_then(|c| c.name("speaking"))
        .is_some_and(|m| !m.as_str().is_empty());
    let anchors = app
        .speaking
        .iter()
        .zip(&tile.anchors)
        .map(|(s, known)| match (s.kind, &s.anchor) {
            (SignalKind::Presence, Some(an)) => find_anchor(t, &tile.node, an).map(|_| 1),
            (SignalKind::Flicker | SignalKind::Deviation, _) => {
                known.as_ref().and_then(|n| t.shape(n)).map(|a| state_of(&a))
            }
            (SignalKind::Caption, _) => Some(caption_state(t, &tile.node, app.os.static_text_role())),
            _ => None,
        })
        .collect();
    let (candidates, shapes) = if calibrate {
        candidates(t, &tile.node)
    } else {
        (Vec::new(), Vec::new())
    };
    Some(TileSample {
        name,
        is_self,
        muted,
        label_speaking,
        anchors,
        candidates,
        shapes,
        slot: tile.slot,
        variant: 0,
    })
}

/// Một lượt nhanh trên các ô đã biết của một cửa sổ.
#[derive(Debug)]
pub struct Round {
    pub samples: Vec<TileSample>,
    /// Ô bắt đầu của lượt sau (xoay vòng khi hết ngân sách giữa chừng).
    pub next: usize,
    /// Một ô không còn: duyệt lại cả cửa sổ.
    pub gone: bool,
}

/// Lượt nhanh bắt đầu từ ô `from`, xoay vòng qua mọi ô trong ngân sách (spec §6.2: vượt thì lượt sau đọc tiếp). Ô đầu tiên của lượt
/// mà vượt cả ngân sách còn nguyên thì bị bỏ qua ở lượt này để lượt sau không kẹt ở nó; ngân sách đã bị phần duyệt cửa sổ dùng bớt
/// thì không bỏ qua ô nào (lượt sau đọc lại từ chính ô đó).
pub fn sample_round<T: Tree>(
    t: &mut T,
    tiles: &[TileRef<T::Node>],
    app: &AppRecipe,
    from: usize,
    calibrate: bool,
    budget: &mut Budget,
) -> Round {
    let n = tiles.len();
    let fresh = budget.used() == 0;
    let mut samples = Vec::new();
    for k in 0..n {
        let i = (from + k) % n;
        match sample_tile(t, &tiles[i], app, calibrate, budget) {
            TileRead::Sample(s) => samples.push(s),
            TileRead::Gone => {
                return Round {
                    samples,
                    next: 0,
                    gone: true,
                };
            }
            TileRead::OutOfBudget => {
                let next = if k == 0 && fresh { (i + 1) % n } else { i };
                return Round {
                    samples,
                    next,
                    gone: false,
                };
            }
        }
    }
    Round {
        samples,
        next: 0,
        gone: false,
    }
}

/// Các dòng định dạng fixture (`độ sâu|role|subrole|title|desc|value|ident|help|dom|lớp`) của một cửa sổ họp, cho công cụ
/// `ax-record fixture`: chỉ vùng web khi `web_only` (bên ngoài chỉ đọc vai trò), tối đa [`MAX_ELEMENTS`] dòng. **Có chữ của app
/// họp** (kể cả khung chat nếu đang mở): chỉ ghi vào `$DATA`, ẩn danh bằng `make_fixture.py` trước khi vào repo.
pub fn dump_lines<T: Tree>(
    t: &mut T,
    window: &T::Node,
    title: &str,
    window_subrole: &str,
    app: &AppRecipe,
) -> Vec<String> {
    let (window_role, default_subrole) = app.os.window_role();
    let window_subrole = if window_subrole.is_empty() {
        default_subrole.to_string()
    } else {
        clean_field(window_subrole)
    };
    let mut out = vec![format!("0|{window_role}|{window_subrole}|{}||||||", clean_field(title))];
    let mut stack: Vec<(T::Node, u32, bool)> = t
        .children(window)
        .into_iter()
        .rev()
        .map(|c| (c, 1, !app.web_only))
        .collect();
    while let Some((n, depth, inside)) = stack.pop() {
        if out.len() >= MAX_ELEMENTS as usize {
            break;
        }
        if depth > MAX_DEPTH {
            continue;
        }
        if !inside {
            if t.role(&n).as_deref() == Some(app.os.web_role()) {
                let mut a = Attrs::default();
                if t.text(&n, &mut a) && app.window_title.iter().any(|re| re.is_match(&a.title)) {
                    a.role = app.os.web_role().into();
                    out.push(line(depth, &a));
                    stack.extend(t.children(&n).into_iter().rev().map(|c| (c, depth + 1, true)));
                }
                continue;
            }
            stack.extend(t.children(&n).into_iter().rev().map(|c| (c, depth + 1, false)));
            continue;
        }
        let Some(mut a) = t.shape(&n) else { continue };
        t.text(&n, &mut a);
        out.push(line(depth, &a));
        stack.extend(t.children(&n).into_iter().rev().map(|c| (c, depth + 1, true)));
    }
    out
}

fn clean_field(s: &str) -> String {
    s.chars()
        .map(|c| if c == '|' || c.is_control() { ' ' } else { c })
        .take(300)
        .collect()
}

fn line(depth: u32, a: &Attrs) -> String {
    format!(
        "{depth}|{}|{}|{}|{}|{}|{}||{}|{}",
        clean_field(&a.role),
        clean_field(&a.subrole),
        clean_field(&a.title),
        clean_field(&a.desc),
        clean_field(&a.value),
        clean_field(&a.ident),
        clean_field(&a.dom_id),
        clean_field(&a.classes.join(" "))
    )
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::reader::tree::tests::{fixture, fixture_path};
    use crate::reader::tree::{FixtureTree, Snapshot};
    use speaker_recipe::{BUILTIN_JSON, MeetingApp, Os, Recipes, parse};
    use std::collections::BTreeSet;

    /// Tên giả được phép trong fixture (QĐ 16).
    pub(crate) const FAKE_NAMES: [&str; 6] = ["Lan", "Minh", "Hoa Phạm", "Lan Nguyễn", "Minh Trần", "Tuấn Lê"];

    pub(crate) fn recipes() -> Recipes {
        parse(BUILTIN_JSON).unwrap()
    }

    /// Công thức trong thư mục fixture (không có trong bản build sẵn); mọi mục phải hợp lệ.
    pub(crate) fn fixture_recipes(file: &str) -> Recipes {
        let r = parse(&std::fs::read_to_string(fixture_path(file)).unwrap()).unwrap();
        assert!(r.dropped.is_empty(), "{file}: {:?}", r.dropped);
        r
    }

    /// Công thức Zoom tổng hợp (QĐ 16): chỉ cho test.
    pub(crate) fn zoom_recipes() -> Recipes {
        fixture_recipes("zoom-macos-synthetic.recipes.json")
    }

    /// Công thức Meet (QĐ 32: tắt mặc định, không có trong bản build sẵn): test thuần và `ax-record --recipe`.
    pub(crate) fn meet_recipes() -> Recipes {
        fixture_recipes("meet-macos.recipes.json")
    }

    /// Mọi ô của mọi cửa sổ họp trong một ảnh chụp, đọc như lượt đầy đủ rồi lấy mẫu (như bộ đọc thật ở lượt đầu).
    pub(crate) fn tiles_of(snap: &Snapshot, app: &AppRecipe) -> (FixtureTree, Vec<TileSample>) {
        let (mut tree, roots) = FixtureTree::parse(&snap.lines);
        let mut out = Vec::new();
        let mut index = 0;
        for w in roots {
            let (title, ident) = (tree.title(w).to_string(), tree.ident(w).to_string());
            if !is_meeting_window(app, &title, &ident, tree.subrole(w)) {
                continue;
            }
            let tiles = Walk::new(w, index, app.web_only)
                .step(&mut tree, app, &mut Budget::unlimited())
                .unwrap();
            index += 1;
            let round = sample_round(&mut tree, &tiles, app, 0, false, &mut Budget::unlimited());
            assert!(!round.gone);
            out.extend(round.samples);
        }
        (tree, out)
    }

    /// Đếm lệnh đọc (mỗi lần gọi `Tree`), như số lệnh Accessibility của bộ đọc thật.
    struct Counting<'a> {
        tree: &'a mut FixtureTree,
        calls: u32,
    }

    impl Tree for Counting<'_> {
        type Node = usize;

        fn role(&mut self, n: &usize) -> Option<String> {
            self.calls += 1;
            self.tree.role(n)
        }

        fn shape(&mut self, n: &usize) -> Option<Attrs> {
            self.calls += 1;
            self.tree.shape(n)
        }

        fn text(&mut self, n: &usize, a: &mut Attrs) -> bool {
            self.calls += 1;
            self.tree.text(n, a)
        }

        fn children(&mut self, n: &usize) -> Vec<usize> {
            self.calls += 1;
            self.tree.children(n)
        }
    }

    fn lines(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn teams_tiles_give_three_people_their_mics_and_the_user() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let (mut lan_open, mut lan_muted) = (false, false);
        for snap in fixture("teams-macos-people-closed.jsonl") {
            let (_, tiles) = tiles_of(&snap, app);
            let names: BTreeSet<&str> = tiles.iter().map(|t| t.name.as_str()).collect();
            assert_eq!(
                names,
                BTreeSet::from(["Hoa Phạm", "Lan", "Minh"]),
                "ảnh chụp {}",
                snap.t
            );
            let me: Vec<&TileSample> = tiles.iter().filter(|t| t.is_self).collect();
            assert_eq!(me.len(), 1);
            assert_eq!((me[0].name.as_str(), me[0].muted), ("Hoa Phạm", Some(true)));
            assert_eq!(
                me[0].anchors,
                [None],
                "ô của chủ phòng (mic tắt) không lần nào có khung đang nói"
            );
            let lan = tiles.iter().find(|t| t.name == "Lan").unwrap();
            lan_open |= lan.muted == Some(false);
            lan_muted |= lan.muted == Some(true);
        }
        assert!(lan_open && lan_muted, "mic của Lan có lúc mở, lúc tắt");
    }

    #[test]
    fn teams_speaking_frames_appear_on_guest_tiles() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let frames = fixture("teams-macos-people-closed.jsonl")
            .iter()
            .flat_map(|s| tiles_of(s, app).1)
            .filter(|t| t.anchors[0].is_some())
            .map(|t| t.name)
            .collect::<BTreeSet<_>>();
        assert_eq!(frames, BTreeSet::from(["Lan".to_string(), "Minh".to_string()]));
    }

    /// QĐ 3: ngoài vùng web của trình duyệt (dấu trang, thẻ khác) không đọc chữ; vùng web khác (Gmail) không đi vào.
    #[test]
    fn meet_reads_text_only_inside_its_web_area() {
        let r = meet_recipes();
        let app = r.app(Os::Macos, MeetingApp::MeetChrome).unwrap();
        let snap = Snapshot {
            t: 0.0,
            lines: lines(&[
                "0|AXWindow|AXStandardWindow|Meet - abc-defg-hij - Google Chrome||||||",
                "1|AXGroup||||||||BrowserRootView",
                "2|AXButton||Gemini API_KEY|Gemini API_KEY||||view_1028|BookmarkButton",
                "2|AXWebArea||Meet - abc-defg-hij||||||",
                "3|AXGroup||||||||oZRSLe",
                "4|AXGroup|AXEmptyGroup|||||||DYfzY cYKTje gjg47c",
                "4|AXGroup|AXEmptyGroup|||||||qg7mD KXY1yb",
                "5|AXStaticText||||Lan Nguyễn||||",
                "2|AXWebArea||Gmail - Hộp thư||||||",
                "3|AXStaticText||||thư riêng||||",
            ]),
        };
        let (tree, tiles) = tiles_of(&snap, app);
        assert_eq!(
            tiles.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(),
            ["Lan Nguyễn"]
        );
        assert!(tiles[0].anchors.iter().all(Option::is_some), "hai neo của Meet");
        assert!(!tree.texts_read.contains(&2), "không đọc chữ của dấu trang");
        assert!(!tree.texts_read.contains(&9), "không đọc chữ trong vùng web khác");
    }

    #[test]
    fn meet_fixture_finds_four_tiles_with_both_anchors() {
        let r = meet_recipes();
        let app = r.app(Os::Macos, MeetingApp::MeetChrome).unwrap();
        for snap in fixture("meet-chrome-macos.jsonl") {
            let (_, tiles) = tiles_of(&snap, app);
            assert_eq!(tiles.len(), 4, "hai cửa sổ, mỗi cửa sổ hai ô (ảnh chụp {})", snap.t);
            assert!(
                tiles
                    .iter()
                    .all(|t| t.name == "Hoa Phạm" && t.anchors.iter().all(Option::is_some))
            );
        }
    }

    #[test]
    fn zoom_labels_give_name_mic_self_and_speaking() {
        let r = zoom_recipes();
        let app = r.app(Os::Macos, MeetingApp::Zoom).unwrap();
        let snaps = fixture("zoom-macos-synthetic.jsonl");
        let (_, tiles) = tiles_of(&snaps[0], app);
        let get = |n: &str| tiles.iter().find(|t| t.name == n).unwrap().clone();
        assert_eq!(
            (get("Lan Nguyễn").muted, get("Lan Nguyễn").label_speaking),
            (Some(false), true)
        );
        assert_eq!(
            (get("Minh Trần").muted, get("Minh Trần").label_speaking),
            (Some(true), false)
        );
        assert!(get("Hoa Phạm").is_self, "hậu tố (me) là chính người dùng");
        let (_, later) = tiles_of(&snaps[3], app);
        assert!(later.iter().any(|t| t.name == "Minh Trần" && t.label_speaking));
    }

    /// Cuộc họp Teams có tên tự đặt: tiêu đề cửa sổ họp là tên cuộc họp, không khớp `window_title` cũ; nhận theo AXSubrole
    /// (fixture ghi trên Teams thật, ẩn danh) rồi vẫn qua cổng `confirm_id`.
    #[test]
    fn a_named_teams_meeting_window_is_found_by_its_subrole() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let mut old = app.clone();
        old.window_subrole.clear();
        let (mut speaking, mut any) = (BTreeSet::new(), false);
        for snap in fixture("teams-macos-named-meeting.jsonl") {
            assert!(
                tiles_of(&snap, &old).1.is_empty(),
                "luật tiêu đề cũ không nhận cửa sổ họp có tên"
            );
            let (_, tiles) = tiles_of(&snap, app);
            let names: BTreeSet<&str> = tiles.iter().map(|t| t.name.as_str()).collect();
            assert_eq!(
                names,
                BTreeSet::from(["Hoa Phạm", "Khách An", "Khách Bình"]),
                "ảnh chụp {}",
                snap.t
            );
            any = true;
            speaking.extend(tiles.iter().filter(|t| t.anchors[0].is_some()).map(|t| t.name.clone()));
        }
        assert!(any);
        // Trong bản ghi này khung của Teams ở yên trên ô khách An vì cửa sổ họp bị che nên Teams không vẽ lại (đo đúng: results/10): fixture chỉ chứng minh
        // nhận cửa sổ, tên và neo; việc khung có đổi theo người nói không do test này kiểm (xem results/10-cua-so-hop-co-ten.md).
        assert_eq!(speaking, BTreeSet::from(["Khách An".to_string()]));
    }

    /// Cửa sổ chính của Teams (cùng AXStandardWindow, tiêu đề lạ) và hộp thoại khác không sinh tên: chỉ cửa sổ có nút Leave mới có ô;
    /// cửa sổ nổi thu gọn (AXSystemDialog) không do luật vai trò phụ nhận.
    #[test]
    fn subrole_windows_without_the_leave_button_or_of_other_subroles_have_no_tiles() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let tile = "1|AXMenuItem||Lan (Guest), Context menu is available|Lan (Guest), Context menu is available|||||";
        let leave = "1|AXButton||Leave|Leave||||hangup-button|fui-Button";
        let snap = |head: &str, with_leave: bool| Snapshot {
            t: 0.0,
            lines: if with_leave {
                lines(&[head, tile, leave])
            } else {
                lines(&[head, tile])
            },
        };
        let main = "0|AXWindow|AXStandardWindow|Meet||||||";
        assert!(
            tiles_of(&snap(main, false), app).1.is_empty(),
            "cửa sổ chính, không có Leave"
        );
        let dialog = "0|AXWindow|AXDialog|Tên cuộc họp||||||";
        assert!(
            tiles_of(&snap(dialog, false), app).1.is_empty(),
            "AXDialog không có Leave không có tên"
        );
        let compact = "0|AXWindow|AXSystemDialog|Meeting compact view | Tên cuộc họp||||||";
        assert!(
            tiles_of(&snap(compact, true), app).1.is_empty(),
            "cửa sổ nổi thu gọn không do luật vai trò phụ nhận (không có ô tên)"
        );
        let named = "0|AXWindow|AXStandardWindow|Tên cuộc họp||||||";
        assert_eq!(tiles_of(&snap(named, true), app).1.len(), 1);
        // Cả hai cửa sổ trong một ảnh chụp: chỉ cửa sổ họp có ô.
        let both = Snapshot {
            t: 0.0,
            lines: lines(&[named, tile, leave, main, tile]),
        };
        assert_eq!(tiles_of(&both, app).1.len(), 1);
        assert!(is_meeting_window(app, "Tên cuộc họp", "", "AXStandardWindow"));
        assert!(!is_meeting_window(app, "Tên cuộc họp", "", "AXSystemDialog"));
        assert!(
            !is_meeting_window(app, "Tên cuộc họp", "", ""),
            "Windows truyền vai trò phụ rỗng: luật cũ"
        );
    }

    /// Spec §6.1: cửa sổ Teams phải có nút rời cuộc gọi mới là cửa sổ họp.
    #[test]
    fn a_teams_window_without_the_leave_button_has_no_tiles() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let tile = "1|AXMenuItem||Lan (Guest), Context menu is available|Lan (Guest), Context menu is available|||||";
        let without = Snapshot {
            t: 0.0,
            lines: lines(&["0|AXWindow|AXStandardWindow|Meeting with Hoa Phạm||||||", tile]),
        };
        assert!(tiles_of(&without, app).1.is_empty());
        let with = Snapshot {
            t: 0.0,
            lines: lines(&[
                "0|AXWindow|AXStandardWindow|Meeting with Hoa Phạm||||||",
                tile,
                "1|AXButton||Leave|Leave||||hangup-button|fui-Button",
            ]),
        };
        assert_eq!(tiles_of(&with, app).1.len(), 1);
    }

    /// Spec §6.2: vượt giới hạn thì dừng lượt đó, lượt sau đọc tiếp; kết quả như đọc một lượt.
    #[test]
    fn a_small_budget_finishes_over_several_passes_with_the_same_tiles() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let snap = &fixture("teams-macos-people-closed.jsonl")[0];
        let (mut tree, roots) = FixtureTree::parse(&snap.lines);
        let names = |tiles: &[TileRef<usize>]| tiles.iter().map(|t| t.name.clone()).collect::<Vec<_>>();
        let full = Walk::new(roots[0], 0, false)
            .step(&mut tree, app, &mut Budget::unlimited())
            .unwrap();
        let mut walk = Walk::new(roots[0], 0, false);
        let mut passes = 0;
        let small = loop {
            passes += 1;
            let mut budget = Budget::new(10, Duration::from_secs(1));
            if let Some(t) = walk.step(&mut tree, app, &mut budget) {
                assert!(budget.used() <= 10);
                break t;
            }
        };
        assert!(passes > 5, "{passes} lượt");
        assert_eq!(names(&small), names(&full));
    }

    #[test]
    fn tile_samples_never_print_names() {
        let s = TileSample {
            name: "Lan Nguyễn".into(),
            is_self: false,
            muted: Some(false),
            label_speaking: true,
            anchors: vec![Some(1)],
            candidates: vec![],
            shapes: vec![],
            slot: 0,
            variant: 0,
        };
        assert!(!format!("{s:?}").contains("Lan"));
    }

    /// QĐ 16, 24: mọi tên ô trong fixture là tên giả; ô chính người dùng chỉ là "Hoa Phạm"; Meet chưa nhận ra ô của người dùng
    /// (0 ô, ghim lại để QĐ 24 không bị quên khi T21 thêm dấu nhận).
    #[test]
    fn fixture_tile_names_are_the_made_up_ones() {
        let (r, z, m) = (recipes(), zoom_recipes(), meet_recipes());
        let cases = [
            (
                "teams-macos-people-closed.jsonl",
                r.app(Os::Macos, MeetingApp::Teams).unwrap(),
            ),
            (
                "teams-macos-people-open.jsonl",
                r.app(Os::Macos, MeetingApp::Teams).unwrap(),
            ),
            (
                "meet-chrome-macos.jsonl",
                m.app(Os::Macos, MeetingApp::MeetChrome).unwrap(),
            ),
            (
                "zoom-macos-synthetic.jsonl",
                z.app(Os::Macos, MeetingApp::Zoom).unwrap(),
            ),
        ];
        for (file, app) in cases {
            let mut selves = 0;
            for snap in fixture(file) {
                for t in tiles_of(&snap, app).1 {
                    assert!(
                        FAKE_NAMES.contains(&t.name.as_str()),
                        "{file}: tên ô không phải tên giả"
                    );
                    if t.is_self {
                        assert_eq!(t.name, "Hoa Phạm", "{file}");
                        selves += 1;
                    }
                }
            }
            if file.starts_with("meet") {
                assert_eq!(selves, 0, "Meet: chưa nhận ra ô của chính người dùng (QĐ 24)");
            } else {
                assert!(selves > 0, "{file}: có ô của chính người dùng");
            }
        }
    }

    /// Teams Windows (kế hoạch 05b Task 11): tên ô của bảng People trong fixture là tên giả; hàng của bảng không có dấu nhận
    /// chính người dùng (nhãn chỉ có vai trò "Organizer"), nên không ô nào là `is_self`.
    #[test]
    fn windows_people_fixture_tile_names_are_the_made_up_ones() {
        let r = fixture_recipes("teams-windows-people.recipes.json");
        let app = r.app(Os::Windows, MeetingApp::Teams).unwrap();
        for file in ["teams-windows-people-open.jsonl", "teams-windows-people-open-2.jsonl"] {
            for snap in fixture(file) {
                let tiles = tiles_of(&snap, app).1;
                assert_eq!(tiles.len(), 3, "{file}: ba hàng người, không tính hàng tiêu đề");
                for t in tiles {
                    assert!(
                        FAKE_NAMES.contains(&t.name.as_str()) || t.name.starts_with("Khach "),
                        "{file}: tên ô không phải tên giả"
                    );
                    assert!(!t.is_self, "{file}");
                }
            }
        }
    }

    /// Teams Windows, nguồn phụ đề (kế hoạch 05b): khung chat của họp mở cùng lúc (tin nhắn của khách và của chủ phòng, một tin gửi giữa
    /// lúc người khác nói) không thành ô: tin nhắn dùng lớp `fui-ChatMessage__body`, phụ đề dùng `fui-ChatMessageCompact__body`. Mọi ô
    /// của hai nguồn đều là tên người (giả), không phải chữ của tin nhắn; bản ghi tiếng Việt (Teams nhận dạng đúng tiếng Việt).
    #[test]
    fn open_chat_never_becomes_a_caption_tile() {
        let r = fixture_recipes("teams-windows-sources.recipes.json");
        let sources = r.variants(Os::Windows, MeetingApp::Teams);
        let mut caption_tiles = 0;
        for snap in fixture("teams-windows-captions-vi-chat.jsonl") {
            for (v, app) in sources.iter().enumerate() {
                for t in tiles_of(&snap, app).1 {
                    assert!(
                        ["Khach Lan", "Khach Minh"].contains(&t.name.as_str()) || t.name == "Hoa Phạm",
                        "nguồn {v}: ô không phải tên người"
                    );
                    caption_tiles += usize::from(v == 1);
                }
            }
        }
        assert!(caption_tiles > 100, "có dòng phụ đề: {caption_tiles}");
    }

    /// Spec §6.2, QĐ 13 (rà soát A-Q3, B-Q2): một lượt (duyệt cửa sổ, lấy mẫu mọi ô, ứng viên tự hiệu chỉnh) không quá
    /// [`MAX_ELEMENTS`] lệnh đọc trên mọi ảnh chụp của mọi fixture, và mọi lệnh đều đi qua ngân sách. In số lệnh tệ nhất (Task 18 chép
    /// vào `results/04-do.md`).
    #[test]
    fn a_whole_pass_with_calibration_stays_within_the_read_limit() {
        let (r, z, m) = (recipes(), zoom_recipes(), meet_recipes());
        let cases = [
            (
                "teams-macos-people-closed.jsonl",
                r.app(Os::Macos, MeetingApp::Teams).unwrap(),
            ),
            (
                "teams-macos-people-open.jsonl",
                r.app(Os::Macos, MeetingApp::Teams).unwrap(),
            ),
            (
                "meet-chrome-macos.jsonl",
                m.app(Os::Macos, MeetingApp::MeetChrome).unwrap(),
            ),
            (
                "zoom-macos-synthetic.jsonl",
                z.app(Os::Macos, MeetingApp::Zoom).unwrap(),
            ),
        ];
        for (file, app) in cases {
            let mut worst = 0;
            for snap in fixture(file) {
                let (mut tree, roots) = FixtureTree::parse(&snap.lines);
                let mut t = Counting {
                    tree: &mut tree,
                    calls: 0,
                };
                let mut budget = Budget::new(MAX_ELEMENTS, Duration::from_secs(60));
                for (k, w) in roots.into_iter().enumerate() {
                    let (title, ident) = (t.tree.title(w).to_string(), t.tree.ident(w).to_string());
                    if !is_meeting_window(app, &title, &ident, t.tree.subrole(w)) {
                        continue;
                    }
                    if let Some(tiles) = Walk::new(w, k as u32, app.web_only).step(&mut t, app, &mut budget) {
                        sample_round(&mut t, &tiles, app, 0, true, &mut budget);
                    }
                }
                assert!(t.calls <= MAX_ELEMENTS, "{file} ảnh chụp {}: {} lệnh", snap.t, t.calls);
                assert_eq!(t.calls, budget.used(), "mọi lệnh đi qua ngân sách");
                worst = worst.max(t.calls);
            }
            eprintln!("{file}: một lượt đầy đủ có ứng viên, tệ nhất {worst} lệnh đọc");
        }
    }

    /// Hết ngân sách giữa các ô: lượt sau đọc tiếp từ ô chưa đọc (xoay vòng); một ô tự nó vượt cả ngân sách còn nguyên khi đứng đầu
    /// lượt thì bị bỏ qua ở lượt đó để không kẹt; ngân sách đã bị dùng bớt thì không bỏ qua.
    #[test]
    fn a_small_budget_rotates_over_the_tiles() {
        let r = meet_recipes();
        let app = r.app(Os::Macos, MeetingApp::MeetChrome).unwrap();
        let snap = &fixture("meet-chrome-macos.jsonl")[0];
        let (mut tree, roots) = FixtureTree::parse(&snap.lines);
        let tiles = Walk::new(roots[0], 0, true)
            .step(&mut tree, app, &mut Budget::unlimited())
            .unwrap();
        assert_eq!(tiles.len(), 2);
        let cost = |i: usize, tree: &mut FixtureTree| {
            let mut b = Budget::unlimited();
            assert!(matches!(
                sample_tile(tree, &tiles[i], app, true, &mut b),
                TileRead::Sample(_)
            ));
            b.used()
        };
        let (c0, c1) = (cost(0, &mut tree), cost(1, &mut tree));
        let mut b = Budget::new(c0 + 1, Duration::from_secs(60));
        let first = sample_round(&mut tree, &tiles, app, 0, true, &mut b);
        assert_eq!((first.samples.len(), first.next, first.gone), (1, 1, false));
        let mut b = Budget::new(c1 + 1, Duration::from_secs(60));
        let second = sample_round(&mut tree, &tiles, app, first.next, true, &mut b);
        assert_eq!(second.samples[0].slot, tiles[1].slot, "lượt sau bắt đầu từ ô chưa đọc");
        let mut tiny = Budget::new(3, Duration::from_secs(60));
        let stuck = sample_round(&mut tree, &tiles, app, 0, true, &mut tiny);
        assert_eq!((stuck.samples.len(), stuck.next, stuck.gone), (0, 1, false));
        // Còn c0 − 1 lệnh: thiếu một lệnh cho ô 0.
        let mut used = Budget::new(c0 + 1, Duration::from_secs(60));
        assert!(used.take() && used.take());
        let kept = sample_round(&mut tree, &tiles, app, 0, true, &mut used);
        assert_eq!(
            (kept.samples.len(), kept.next),
            (0, 0),
            "ngân sách đã dùng bớt: không bỏ qua ô 0"
        );
    }

    /// `ax-record fixture` ghi đúng định dạng fixture: ghi rồi đọc lại cho cùng các ô.
    #[test]
    fn dumped_lines_read_back_to_the_same_tiles() {
        let r = recipes();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let snap = &fixture("teams-macos-people-closed.jsonl")[0];
        let (mut tree, roots) = FixtureTree::parse(&snap.lines);
        let title = tree.title(roots[0]).to_string();
        let lines = dump_lines(&mut tree, &roots[0], &title, "", app);
        assert!(lines[0].starts_with("0|AXWindow|AXStandardWindow|Meeting with "));
        let again = Snapshot { t: 0.0, lines };
        let names = |s: &Snapshot| {
            tiles_of(s, app)
                .1
                .into_iter()
                .map(|t| (t.name, t.muted, t.anchors))
                .collect::<Vec<_>>()
        };
        assert_eq!(names(&again), names(snap));
    }
}
