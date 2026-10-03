"""Test của mapping.py. Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapping import blockers, parse, release_problems, summary  # noqa: E402

TABLE = """# Bảng
| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 1 | Thu âm | 02, 08 | A1 ở 08; chờ C1 (người) | chờ |
| 2 | Ký số | 07 | Chờ T1, T2 | chưa làm |
| 3 | Thử Windows | 02 (Win) | | đang làm |
| 4 | Quyết định | CDA, 02 | Điểm cần quyết 1 | chưa làm |
| 5 | Xong rồi | 01 | 01: Task 2 `4e0dfe9` | xong |
| 6 | Để sau | 08 | hoãn, chủ dự án duyệt 2026-10-05 | hoãn |
"""


class Parse(unittest.TestCase):
    def test_rows_and_statuses(self):
        rows, problems = parse(TABLE)
        self.assertEqual(problems, [])
        self.assertEqual([r.num for r in rows], [1, 2, 3, 4, 5, 6])
        self.assertEqual([r.status for r in rows], ["chờ", "chưa làm", "đang làm", "chưa làm", "xong", "hoãn"])
        self.assertEqual(rows[0].line, 4)

    def test_a_row_with_odd_spacing_is_a_format_problem_not_skipped(self):
        """Dòng bảng viết lệch khoảng trắng không được bỏ qua lặng lẽ (N3 của review 08 lần 2)."""
        _, problems = parse("|  2 | a | 01 | | chờ |\n|3| b | 01 | | chờ |\n| 4 | c | 01 | | xong |\n")
        self.assertEqual([p.split(":")[0] for p in problems], ["dòng 1", "dòng 2"])
        self.assertTrue(all("sai định dạng" in p for p in problems))

    def test_format_problems(self):
        bad = TABLE + "| 7 | Thiếu cột | 01 | xong |\n| 8 | A | 01 | | xong rồi |\n| 5 | Trùng | 01 | | xong |\n"
        _, problems = parse(bad)
        self.assertEqual(len(problems), 3)
        self.assertIn("sai số cột", problems[0])
        self.assertIn("trạng thái lạ", problems[1])
        self.assertIn("bị trùng", problems[2])


class Blockers(unittest.TestCase):
    def test_codes_and_tags(self):
        rows, _ = parse(TABLE)
        self.assertEqual(blockers(rows[0]), ["C1", "người"])
        self.assertEqual(blockers(rows[1]), ["T1", "T2"])
        self.assertEqual(blockers(rows[2]), ["Windows"])
        self.assertEqual(blockers(rows[3]), ["chủ dự án"])

    def test_codes_inside_words_and_shas_are_not_codes(self):
        rows, _ = parse("| 9 | x | 01 | SHA `c13ab` và C130 nhưng ATC1, Q1A | chờ |\n")
        self.assertEqual(blockers(rows[0]), ["C130"])

    def test_a_task_with_its_commit_is_not_an_account_code(self):
        rows, _ = parse("| 9 | x | 04 | 04: T8 `adb1e7b`, T11 `1797cd1`; chờ T1, T2 | chờ |\n")
        self.assertEqual(blockers(rows[0]), ["T1", "T2"])

    def test_people_and_windows_written_in_the_note(self):
        rows, _ = parse("| 9 | x | 06 | thử tay chờ 06b Task 6 (cần người); 01 Task 25 dòng 3 (Win) | chờ |\n")
        self.assertEqual(blockers(rows[0]), ["người", "Windows"])

    def test_people_tag(self):
        rows, _ = parse("| 9 | x | 08 (người), 02 | | chờ |\n")
        self.assertEqual(blockers(rows[0]), ["người"])

    def test_no_marker_is_other(self):
        rows, _ = parse("| 9 | x | 07 | | chưa làm |\n")
        self.assertEqual(blockers(rows[0]), ["khác"])


class Summary(unittest.TestCase):
    def test_counts_and_groups_skip_done_and_postponed(self):
        rows, _ = parse(TABLE)
        counts, groups = summary(rows)
        self.assertEqual(counts, {"chưa làm": 2, "đang làm": 1, "chờ": 1, "xong": 1, "hoãn": 1})
        self.assertEqual(groups, {"C1": [1], "T1": [2], "T2": [2], "Windows": [3], "chủ dự án": [4], "người": [1]})

    def test_groups_are_sorted_by_size(self):
        rows, _ = parse("| 1 | a | 07 | T1 | chờ |\n| 2 | b | 07 | C6 | chờ |\n| 3 | c | 07 | C6 | chờ |\n")
        self.assertEqual(list(summary(rows)[1]), ["C6", "T1"])


class Release(unittest.TestCase):
    def test_every_row_not_done_blocks_the_release(self):
        rows, problems = parse(TABLE)
        issues = release_problems(rows, problems)
        self.assertEqual(issues, ["#1: chờ", "#2: chưa làm", "#3: đang làm", "#4: chưa làm"])

    def test_postponed_needs_the_owner_approval_with_its_date(self):
        text = ("| 1 | a | 08 | chủ dự án duyệt | hoãn |\n"
                "| 2 | b | 08 | hoãn, chủ dự án duyệt 2026-10-05 | hoãn |\n"
                "| 3 | c | 02, 08 | 02 kiểm ngày 2026-10-01; vẫn tắt, kiểm 2026-11-02 | hoãn |\n")
        rows, problems = parse(text)
        why = "hoãn mà Ghi chú không có \"chủ dự án duyệt YYYY-MM-DD\""
        self.assertEqual(release_problems(rows, problems), [f"#1: {why}", f"#3: {why}"])

    def test_a_request_or_an_impossible_date_is_not_an_approval(self):
        """"gửi chủ dự án duyệt …" là mới đề xuất; ngày phải có thật (N3 của review 08 lần 2)."""
        text = ("| 1 | a | 08 | đề xuất hoãn, gửi chủ dự án duyệt 2026-10-05 | hoãn |\n"
                "| 2 | b | 08 | hoãn, chờ chủ dự án duyệt 2026-10-05 | hoãn |\n"
                "| 3 | c | 08 | hoãn, chủ dự án duyệt 2026-99-99 | hoãn |\n"
                "| 4 | d | 08 | hoãn, chủ dự án duyệt 2026-02-29 | hoãn |\n"
                "| 5 | e | 08 | hoãn, chủ dự án duyệt 2028-02-29 | hoãn |\n")
        rows, problems = parse(text)
        self.assertEqual([i.split(":")[0] for i in release_problems(rows, problems)], ["#1", "#2", "#3", "#4"])

    def test_format_problems_block_the_release(self):
        rows, problems = parse("| 1 | a | 01 | | xong |\n| 1 | b | 01 | | xong |\n")
        self.assertEqual(len(release_problems(rows, problems)), 1)

    def test_all_done_is_ready(self):
        rows, problems = parse("| 1 | a | 01 | `abc1234` | xong |\n")
        self.assertEqual(release_problems(rows, problems), [])


if __name__ == "__main__":
    unittest.main()
