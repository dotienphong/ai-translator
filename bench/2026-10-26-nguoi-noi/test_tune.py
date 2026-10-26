"""cd bench/2026-10-26-nguoi-noi && python -m unittest test_tune (hay `python -I test_tune.py`).
Kiểm logic chọn θ, mức gộp và các dòng ghi chú của `tune.py` (phần thuần, không chạy binary)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tune import MERGES, THETAS, choose, edge_warning, merge_note, theta_note, tied_merges, tied_thetas  # noqa: E402

BASE = 0.800  # mục tiêu "nền" của các ô không được nhắc tới
ABOVE = 0.900  # mục tiêu của ô thắng


def make_grid(cells=None, fill=BASE):
    """Lưới đủ THETAS x MERGES, mọi ô bằng `fill` trừ các ô trong `cells` ({(θ, gộp): giá trị})."""
    grid = {(t, m): fill for t in THETAS for m in MERGES}
    grid.update(cells or {})
    return grid


class MergeTieTest(unittest.TestCase):
    """Cùng θ, các mức gộp hòa nhau: luôn chọn mức thận trọng nhất (đứng đầu trong MERGES) và ghi chú nói đúng mức đó."""

    def check(self, grid, theta, expected_merge):
        t, m = choose(grid)
        self.assertEqual((t, m), (theta, expected_merge))
        best = max(grid.values())
        note = merge_note([grid[t, g] for g in MERGES], best, m)
        self.assertIn(f"{m:.2f}", note)
        return note

    def test_clear_winner_is_chosen(self):
        grid = make_grid({(0.40, 0.60): ABOVE})
        note = self.check(grid, 0.40, 0.60)
        self.assertIn("gộp có tác dụng", note)

    def test_tie_of_5e_minus_10_picks_the_conservative_level(self):
        # Mức 0,75 hơn 1,10 đúng 5e-10 (< TIE): hòa. Vòng chọn từng lấy 0,75 (so sánh `>` chặt) còn ghi chú nói 1,10.
        grid = make_grid({(0.40, 1.10): ABOVE, (0.40, 0.75): ABOVE + 5e-10})
        note = self.check(grid, 0.40, 1.10)
        self.assertIn("không đổi kết quả", note)
        self.assertIn("[0.75, 1.10]", note)
        self.assertIn("chọn mức thận trọng nhất 1.10", note)

    def test_tie_of_2e_minus_16_picks_the_conservative_level(self):
        grid = make_grid({(0.40, 1.10): ABOVE, (0.40, 0.70): ABOVE + 2e-16})
        note = self.check(grid, 0.40, 1.10)
        self.assertIn("không đổi kết quả", note)

    def test_difference_above_tie_is_not_a_tie(self):
        grid = make_grid({(0.40, 1.10): ABOVE, (0.40, 0.75): ABOVE + 2e-9})
        note = self.check(grid, 0.40, 0.75)
        self.assertIn("gộp có tác dụng", note)

    def test_chain_of_near_ties_follows_the_best_value_not_the_scan_order(self):
        # Ba mức hơn nhau 0,9e-9 từng bước: 1,10 và 0,70 cách nhau 1,8e-9 (> TIE) nhưng 0,75 hòa với cả hai. Hòa tính theo mục tiêu
        # CAO NHẤT (0,70): nhóm hòa là {0,75; 0,70} nên chọn 0,75. Quét tuần tự `v > best + TIE` sẽ dừng ở 0,70 và mâu thuẫn ghi chú.
        grid = make_grid({(0.40, 1.10): ABOVE, (0.40, 0.75): ABOVE + 0.9e-9, (0.40, 0.70): ABOVE + 1.8e-9})
        note = self.check(grid, 0.40, 0.75)
        self.assertIn("[0.70, 0.75]", note)

    def test_never_merge_level_alone_is_reported_as_such(self):
        grid = make_grid({(0.40, 1.10): ABOVE})
        note = self.check(grid, 0.40, 1.10)
        self.assertIn("không bao giờ gộp", note)

    def test_non_adjacent_ties_are_listed_not_ranged(self):
        grid = make_grid({(0.40, 0.75): ABOVE, (0.40, 0.60): ABOVE})
        note = self.check(grid, 0.40, 0.75)
        self.assertIn("không liền nhau", note)
        self.assertIn("0.75, 0.60", note)

    def test_tied_merges_are_in_conservative_first_order(self):
        grid = make_grid({(0.40, 0.45): ABOVE, (0.40, 1.10): ABOVE, (0.40, 0.65): ABOVE})
        self.assertEqual(tied_merges(grid, 0.40), [1.10, 0.65, 0.45])

    def test_merge_note_rejects_a_level_outside_the_tied_group(self):
        grid = make_grid({(0.40, 0.75): ABOVE})
        with self.assertRaises(ValueError):
            merge_note([grid[0.40, g] for g in MERGES], ABOVE, 1.10)


class ThetaTieTest(unittest.TestCase):
    """Các θ hòa mục tiêu: chọn θ gần 0,40 nhất, hòa tiếp thì θ thấp hơn."""

    def test_clear_winner_is_chosen_without_a_theta_note(self):
        grid = make_grid({(0.30, 0.70): ABOVE})
        self.assertEqual(choose(grid), (0.30, 0.70))
        self.assertIsNone(theta_note(tied_thetas(grid), 0.30))

    def test_tie_prefers_theta_closest_to_default(self):
        grid = make_grid({(0.30, 1.10): ABOVE, (0.45, 1.10): ABOVE})
        self.assertEqual(choose(grid), (0.45, 1.10))  # |0,45 - 0,40| = 0,05 < |0,30 - 0,40| = 0,10

    def test_equally_close_thetas_pick_the_lower_one(self):
        # 0,35 và 0,45 cùng cách 0,40 một khoảng 0,05; số thực cho |0,35 - 0,40| lớn hơn |0,45 - 0,40| một chút nên so thô sẽ chọn nhầm 0,45.
        grid = make_grid({(0.35, 1.10): ABOVE, (0.45, 1.10): ABOVE})
        self.assertEqual(choose(grid), (0.35, 1.10))

    def test_default_theta_itself_wins_a_tie(self):
        grid = make_grid({(0.20, 1.10): ABOVE, (0.40, 1.10): ABOVE + 5e-10, (0.60, 1.10): ABOVE})
        self.assertEqual(choose(grid), (0.40, 1.10))

    def test_theta_tie_within_tolerance_counts_as_tie(self):
        grid = make_grid({(0.25, 1.10): ABOVE + 5e-10, (0.50, 1.10): ABOVE})
        self.assertEqual(choose(grid), (0.50, 1.10))  # 0,50 cách 0,40 là 0,10 < 0,15 của 0,25

    def test_theta_difference_above_tolerance_is_not_a_tie(self):
        grid = make_grid({(0.25, 1.10): ABOVE + 2e-9, (0.40, 1.10): ABOVE})
        self.assertEqual(choose(grid), (0.25, 1.10))

    def test_merge_is_picked_among_the_chosen_thetas_own_ties(self):
        # θ 0,45 thắng phá hòa; ở 0,45 chỉ mức 0,60 và 0,55 đạt mục tiêu (0,60 đứng trước), còn ở 0,30 mức 1,10 mới đạt.
        grid = make_grid({(0.30, 1.10): ABOVE, (0.45, 0.60): ABOVE, (0.45, 0.55): ABOVE})
        self.assertEqual(choose(grid), (0.45, 0.60))

    def test_tied_thetas_are_in_grid_order_and_note_names_the_chosen_one(self):
        grid = make_grid({(0.30, 1.10): ABOVE, (0.35, 0.70): ABOVE, (0.45, 1.10): ABOVE})
        tied = tied_thetas(grid)
        self.assertEqual(tied, [0.30, 0.35, 0.45])
        theta, _ = choose(grid)
        self.assertEqual(theta, 0.35)  # 0,35 và 0,45 cùng cách 0,40; hòa tiếp thì lấy θ thấp hơn
        note = theta_note(tied, theta)
        self.assertIn("0.30, 0.35, 0.45", note)  # 0,30; 0,35; 0,45 không đứng liền nhau trên lưới nên liệt kê, không viết khoảng
        self.assertIn("không liền nhau", note)
        self.assertIn("chọn θ gần 0.40 nhất: 0.35", note)

    def test_contiguous_tied_thetas_are_shown_as_a_range(self):
        grid = make_grid({(0.35, 1.10): ABOVE, (0.40, 1.10): ABOVE, (0.45, 1.10): ABOVE})
        theta, _ = choose(grid)
        self.assertEqual(theta, 0.40)
        note = theta_note(tied_thetas(grid), theta)
        self.assertIn("[0.35, 0.45]", note)
        self.assertNotIn("không liền nhau", note)


class EdgeWarningTest(unittest.TestCase):
    def test_edges_warn(self):
        for t in (min(THETAS), max(THETAS)):
            w = edge_warning(t)
            self.assertIsNotNone(w, t)
            self.assertIn("θ chạm mép lưới, cân nhắc mở rộng", w)
        self.assertEqual((min(THETAS), max(THETAS)), (0.20, 0.60))

    def test_inner_values_do_not_warn(self):
        for t in THETAS[1:-1]:
            self.assertIsNone(edge_warning(t), t)

    def test_chosen_edge_theta_triggers_the_warning(self):
        grid = make_grid({(0.20, 1.10): ABOVE})
        theta, _ = choose(grid)
        self.assertIsNotNone(edge_warning(theta))


if __name__ == "__main__":
    unittest.main()
