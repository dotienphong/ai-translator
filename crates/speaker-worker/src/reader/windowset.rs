//! Điều phối một lượt đọc trên các cửa sổ họp đã tìm được (spec 2026-10-26-phan-biet-nguoi-noi §6.2; kế hoạch 05 QĐ 5): với từng
//! cửa sổ, đi tiếp lượt đầy đủ (tìm ô và neo) khi tới hạn hay chưa xong, rồi lấy mẫu các ô đã biết, tất cả trong **một** ngân sách.
//! Viết cho mọi [`Tree`]: chạy trên cây ghi sẵn trong test, trên UI Automation ở Windows. Cùng logic với vòng lặp trong
//! `reader::macos::LiveReader::tick`, chưa dùng chung với nó (kế hoạch 05, "Để kế hoạch sau").

use std::time::Instant;

use speaker_protocol::ReaderStatus;
use speaker_recipe::AppRecipe;

use super::FULL_EVERY;
use super::extract::{Budget, TileRef, TileSample, Walk, sample_round};
use super::tree::Tree;

/// Chừng này lượt liền có lệnh quá hạn hay bị chặn thì trạng thái là `Blocked` (như `BLOCKED_AFTER` của bộ đọc macOS).
pub const BLOCKED_AFTER: u32 = 5;

/// Số lượt hỏng liền nhau sau lượt này, và trạng thái của lượt này. `broken`: lượt này có lệnh quá hạn hay bị chặn. Bộ đọc Windows chỉ
/// cho `Ok` hay `Blocked`: Windows không có quyền nào để xin, nên không bao giờ `NoPermission` (QĐ 7 của kế hoạch 05; trạng thái đó
/// làm dòng mời cấp quyền Trợ năng hiện ra).
pub fn health(failures: u32, broken: bool) -> (u32, ReaderStatus) {
    let failures = if broken { failures + 1 } else { 0 };
    let status = if failures >= BLOCKED_AFTER {
        ReaderStatus::Blocked
    } else {
        ReaderStatus::Ok
    };
    (failures, status)
}

/// Trạng thái đọc của một cửa sổ họp.
pub struct WindowState<N> {
    pub id: isize,
    pub node: N,
    pub title: String,
    walk: Option<Walk<N>>,
    tiles: Vec<TileRef<N>>,
    last_full: Option<Instant>,
    /// Phải duyệt lại cả cửa sổ (mới thấy, hay một ô không còn đọc được).
    stale: bool,
    /// Ô bắt đầu của lượt nhanh kế (xoay vòng khi hết ngân sách giữa chừng).
    next: usize,
}

impl<N> WindowState<N> {
    pub fn new(id: isize, node: N, title: String) -> Self {
        Self {
            id,
            node,
            title,
            walk: None,
            tiles: Vec::new(),
            last_full: None,
            stale: true,
            next: 0,
        }
    }

    pub fn tile_count(&self) -> usize {
        self.tiles.len()
    }
}

/// Danh sách cửa sổ mới (số hiệu, tiêu đề): cửa sổ còn đó giữ trạng thái đọc (ô, neo, nhịp), cửa sổ mới dựng bằng `make`
/// (`None`: không dựng được thì bỏ qua), cửa sổ không còn thì bỏ.
pub fn reconcile<N>(
    old: Vec<WindowState<N>>,
    found: &[(isize, String)],
    mut make: impl FnMut(isize) -> Option<N>,
) -> Vec<WindowState<N>> {
    let mut old = old;
    let mut out = Vec::new();
    for (id, title) in found {
        match old.iter().position(|w| w.id == *id) {
            Some(i) => {
                let mut kept = old.swap_remove(i);
                kept.title.clone_from(title);
                out.push(kept);
            }
            None => {
                if let Some(node) = make(*id) {
                    out.push(WindowState::new(*id, node, title.clone()));
                }
            }
        }
    }
    out
}

/// Một lượt đọc: mẫu của mọi ô, và có đi tiếp lượt đầy đủ không. Hết ngân sách giữa chừng thì phần đang đọc dở bị bỏ, lượt sau đọc
/// tiếp (lượt đầy đủ từ phần tử chưa duyệt, lượt nhanh từ ô chưa đọc). `variant`: thứ tự của `recipe` trong các nguồn của app; ghi
/// vào mọi ô lấy mẫu ([`TileSample::variant`]).
pub fn read_windows<T: Tree>(
    t: &mut T,
    windows: &mut [WindowState<T::Node>],
    recipe: &AppRecipe,
    variant: u8,
    calibrate: bool,
    budget: &mut Budget,
) -> (Vec<TileSample>, bool) {
    let mut tiles = Vec::new();
    let mut full = false;
    for (k, w) in windows.iter_mut().enumerate() {
        let due = w.stale || w.walk.is_some() || w.last_full.is_none_or(|at| at.elapsed() >= FULL_EVERY);
        if due && !budget.exhausted() {
            full = true;
            let walk = w
                .walk
                .get_or_insert_with(|| Walk::new(w.node.clone(), k as u32, recipe.web_only));
            if let Some(found) = walk.step(t, recipe, budget) {
                w.tiles = found;
                w.walk = None;
                w.last_full = Some(Instant::now());
                w.stale = false;
                w.next = 0;
            }
        }
        let round = sample_round(t, &w.tiles, recipe, w.next, calibrate, budget);
        w.next = round.next;
        w.stale |= round.gone;
        tiles.extend(round.samples.into_iter().map(|s| TileSample { variant, ..s }));
    }
    (tiles, full)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reader::tree::tests::fixture;
    use crate::reader::tree::{FixtureTree, Snapshot};
    use speaker_recipe::{BUILTIN_JSON, MeetingApp, Os, parse};
    use std::collections::BTreeSet;
    use std::time::Duration;

    /// Cây ghi sẵn có thể "mất" (mọi lệnh đọc trả rỗng), để thử ô không còn.
    struct Flaky {
        tree: FixtureTree,
        dead: bool,
    }

    impl Tree for Flaky {
        type Node = usize;

        fn role(&mut self, n: &usize) -> Option<String> {
            if self.dead { None } else { self.tree.role(n) }
        }

        fn shape(&mut self, n: &usize) -> Option<speaker_recipe::Attrs> {
            if self.dead { None } else { self.tree.shape(n) }
        }

        fn text(&mut self, n: &usize, a: &mut speaker_recipe::Attrs) -> bool {
            !self.dead && self.tree.text(n, a)
        }

        fn children(&mut self, n: &usize) -> Vec<usize> {
            if self.dead { Vec::new() } else { self.tree.children(n) }
        }
    }

    fn teams_window(snap: &Snapshot) -> (Flaky, Vec<WindowState<usize>>) {
        let (tree, roots) = FixtureTree::parse(&snap.lines);
        let windows = roots
            .iter()
            .map(|&r| WindowState::new(r as isize, r, tree.title(r).to_string()))
            .collect();
        (Flaky { tree, dead: false }, windows)
    }

    fn names(samples: &[TileSample]) -> BTreeSet<&str> {
        samples.iter().map(|s| s.name.as_str()).collect()
    }

    /// Lượt đầu duyệt cả cửa sổ rồi lấy mẫu; lượt kế (chưa tới hạn) chỉ đọc nhanh, cùng các ô.
    #[test]
    fn a_full_pass_then_fast_passes() {
        let r = parse(BUILTIN_JSON).unwrap();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let (mut t, mut windows) = teams_window(&fixture("teams-macos-people-closed.jsonl")[0]);
        let (first, full) = read_windows(&mut t, &mut windows[..1], app, 0, false, &mut Budget::unlimited());
        assert!(full);
        assert_eq!(names(&first), BTreeSet::from(["Hoa Phạm", "Lan", "Minh"]));
        assert_eq!(windows[0].tile_count(), 3);
        let (second, full) = read_windows(&mut t, &mut windows[..1], app, 0, false, &mut Budget::unlimited());
        assert!(!full, "chưa tới {FULL_EVERY:?}");
        assert_eq!(names(&second), names(&first));
    }

    /// Ngân sách nhỏ: lượt đầy đủ đi tiếp qua nhiều lượt, cuối cùng vẫn tìm đủ ô (không kẹt ở một phần tử).
    #[test]
    fn a_small_budget_converges_over_several_passes() {
        let r = parse(BUILTIN_JSON).unwrap();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let (mut t, mut windows) = teams_window(&fixture("teams-macos-people-closed.jsonl")[0]);
        let mut passes = 0;
        let samples = loop {
            passes += 1;
            assert!(passes < 200, "không hội tụ");
            let mut budget = Budget::new(40, Duration::from_secs(5));
            let (s, _) = read_windows(&mut t, &mut windows[..1], app, 0, false, &mut budget);
            if windows[0].tile_count() == 3 && s.len() == 3 {
                break s;
            }
        };
        assert!(passes > 1, "40 lệnh không đủ cho cả cửa sổ");
        assert_eq!(names(&samples), BTreeSet::from(["Hoa Phạm", "Lan", "Minh"]));
    }

    /// Một ô không còn đọc được thì đánh dấu duyệt lại; cây trở lại thì lượt kế tìm lại đủ ô.
    #[test]
    fn a_vanished_tile_triggers_a_new_full_pass() {
        let r = parse(BUILTIN_JSON).unwrap();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let (mut t, mut windows) = teams_window(&fixture("teams-macos-people-closed.jsonl")[0]);
        read_windows(&mut t, &mut windows[..1], app, 0, false, &mut Budget::unlimited());
        t.dead = true;
        let (none, _) = read_windows(&mut t, &mut windows[..1], app, 0, false, &mut Budget::unlimited());
        assert!(none.is_empty());
        t.dead = false;
        let (again, full) = read_windows(&mut t, &mut windows[..1], app, 0, false, &mut Budget::unlimited());
        assert!(full, "duyệt lại cả cửa sổ");
        assert_eq!(names(&again).len(), 3);
    }

    /// Năm lượt hỏng liền thì `Blocked`; một lượt tốt là hết; không bao giờ `NoPermission`.
    #[test]
    fn five_broken_passes_in_a_row_block_and_one_good_pass_clears() {
        let mut failures = 0;
        let mut seen = Vec::new();
        for broken in [true, true, true, true, true, true, false, true] {
            let (f, status) = health(failures, broken);
            failures = f;
            seen.push(status);
        }
        use ReaderStatus::{Blocked, Ok};
        assert_eq!(seen, [Ok, Ok, Ok, Ok, Blocked, Blocked, Ok, Ok]);
        assert!(seen.iter().all(|s| *s != ReaderStatus::NoPermission));
    }

    #[test]
    fn reconcile_keeps_known_windows_and_drops_the_rest() {
        let mut old = vec![
            WindowState::new(1, 10usize, "cũ".into()),
            WindowState::new(2, 20, "bị đóng".into()),
        ];
        old[0].next = 5;
        let found = [(1, "mới".to_string()), (3, "thêm".to_string()), (4, "lỗi".to_string())];
        let mut made = Vec::new();
        let out = reconcile(old, &found, |id| {
            made.push(id);
            (id != 4).then_some(id as usize * 10)
        });
        assert_eq!(made, [3, 4], "cửa sổ còn đó không dựng lại");
        assert_eq!(out.iter().map(|w| w.id).collect::<Vec<_>>(), [1, 3]);
        assert_eq!((out[0].title.as_str(), out[0].next, out[0].node), ("mới", 5, 10));
        assert_eq!((out[1].title.as_str(), out[1].node), ("thêm", 30));
    }
}
