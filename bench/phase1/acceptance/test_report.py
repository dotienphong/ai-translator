"""Test của report.py. Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from report import FAIL, NONE, PASS, build, render  # noqa: E402

PLAN_DONE = "| 1 | a | 01 | `abc1234` | xong |\n| 2 | b | 08 | hoãn, chủ dự án duyệt 2026-10-05 | hoãn |\n"
PLAN_OPEN = "| 1 | a | 01 | | chờ |\n"
MATRIX = """| Hệ điều hành | App họp | Thiết bị | Kết quả |
|---|---|---|---|
| macOS 26 | Zoom | loa | đạt |
| macOS 26 | Teams | tai nghe Bluetooth | {last} |
"""


class Report(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name
        self.plan = os.path.join(self.dir, "plan.md")
        self.write("plan.md", PLAN_DONE)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, content):
        with open(os.path.join(self.dir, name), "w", encoding="utf-8") as f:
            f.write(content if isinstance(content, str) else json.dumps(content))

    def complete(self):
        self.write("a1-matrix.md", MATRIX.format(last="đạt"))
        self.write("a2-m4pro.json", {"tier": "khuyennghi", "machine": "macOS | M4 Pro | 24.0 GB", "pass": True})
        self.write("a2-m1-8gb.json", {"tier": "toithieu", "machine": "macOS | M1 | 8.0 GB", "pass": True})
        self.write("a3.json", {"pass": True})
        self.write("a4-turbo.json", {"pack": "turbo", "pass": True})
        self.write("a4-small.json", {"pack": "small", "pass": True})
        self.write("a5-mac.json", {"os": "mac", "host": "aaa", "pass_a5": True, "pass_cpu": True})
        self.write("a5-win.json", {"os": "win", "host": "bbb", "pass_a5": True, "pass_cpu": True})
        self.write("a6-checklist.md", "- [x] Gatekeeper\n- [x] Gỡ app\n")
        self.write("a7-mac.json", {"os": "mac", "host": "aaa", "har_sha256": "1", "pass": True})
        self.write("a7-win.json", {"os": "win", "host": "bbb", "har_sha256": "2", "pass": True})

    def statuses(self):
        return {name: status for name, status, _, _ in build(self.dir, self.plan)}

    def test_everything_passing_is_accepted(self):
        self.complete()
        text, overall = render(build(self.dir, self.plan))
        self.assertTrue(overall)
        self.assertIn("Kết luận: **ĐẠT**", text)
        self.assertEqual(set(self.statuses().values()), {PASS})

    def test_nothing_yet_means_no_data_not_a_pass(self):
        s = self.statuses()
        self.assertEqual({k for k, v in s.items() if v != NONE}, {"Bảng đối chiếu (kế hoạch 00, Task 5)"})
        self.assertEqual(s["Bảng đối chiếu (kế hoạch 00, Task 5)"], PASS)
        self.assertFalse(render(build(self.dir, self.plan))[1])

    def test_a_failed_matrix_cell_or_an_untried_one(self):
        self.complete()
        self.write("a1-matrix.md", MATRIX.format(last="không đạt"))
        self.assertEqual(self.statuses()["A1 Tương thích"], FAIL)
        self.write("a1-matrix.md", MATRIX.format(last="chưa thử"))
        self.assertEqual(self.statuses()["A1 Tương thích"], NONE)

    def test_a2_needs_both_machine_classes(self):
        self.complete()
        os.remove(os.path.join(self.dir, "a2-m1-8gb.json"))
        self.assertEqual(self.statuses()["A2 Độ trễ"], NONE)
        self.write("a2-m1-8gb.json", {"tier": "toithieu", "machine": "macOS | M1 | 8.0 GB", "pass": False})
        self.assertEqual(self.statuses()["A2 Độ trễ"], FAIL)

    def test_one_failed_file_fails_the_criterion(self):
        self.complete()
        self.write("a4-small.json", {"pack": "small", "pass": False})
        self.write("a7-win.json", {"os": "win", "host": "bbb", "har_sha256": "2", "pass": False})
        self.write("a5-win.json", {"os": "win", "host": "bbb", "pass_a5": True, "pass_cpu": False})
        s = self.statuses()
        self.assertEqual((s["A4 Nhận dạng giọng nói"], s["A5 Ổn định (2 giờ)"], s["§8 Tải máy ≤ 30%"],
                          s["A7 Quyền riêng tư"]), (FAIL, PASS, FAIL, FAIL))

    def test_part_of_the_required_set_is_not_enough(self):
        """Một gói, một máy là chưa đủ số liệu, kể cả khi file có mặt đều đạt (Q2 của review 08 lần 1)."""
        self.complete()
        for name in ("a4-small.json", "a5-win.json", "a7-win.json"):
            os.remove(os.path.join(self.dir, name))
        rows = {name: (status, detail) for name, status, _, detail in build(self.dir, self.plan)}
        self.assertEqual(rows["A4 Nhận dạng giọng nói"], (NONE, "thiếu: small"))
        self.assertEqual(rows["A5 Ổn định (2 giờ)"], (NONE, "thiếu: win"))
        self.assertEqual(rows["§8 Tải máy ≤ 30%"], (NONE, "thiếu: win"))
        self.assertEqual(rows["A7 Quyền riêng tư"], (NONE, "thiếu: win"))
        self.write("a5-mac.json", {"pass_a5": False, "pass_cpu": True})
        self.assertEqual(self.statuses()["A5 Ổn định (2 giờ)"], FAIL, "một file không đạt là không đạt, kể cả khi còn thiếu")

    def test_the_content_decides_not_the_file_name(self):
        """Chép kết quả Mac thành tên Windows, hay kết quả turbo thành tên small: vẫn thiếu (Q1 của review 08 lần 2)."""
        self.complete()
        with open(os.path.join(self.dir, "a5-mac.json"), encoding="utf-8") as f:
            self.write("a5-win.json", f.read())
        with open(os.path.join(self.dir, "a7-mac.json"), encoding="utf-8") as f:
            self.write("a7-win.json", f.read())
        self.write("a4-small.json", {"pack": "turbo", "pass": True})
        rows = {name: (status, detail) for name, status, _, detail in build(self.dir, self.plan)}
        self.assertEqual(rows["A5 Ổn định (2 giờ)"], (NONE, "thiếu: win"))
        self.assertEqual(rows["A7 Quyền riêng tư"], (NONE, "thiếu: win"))
        self.assertEqual(rows["A4 Nhận dạng giọng nói"], (NONE, "thiếu: small"))

    def test_the_two_machine_classes_need_two_machines(self):
        self.complete()
        self.write("a2-m1-8gb.json", {"tier": "toithieu", "machine": "macOS | M4 Pro | 24.0 GB", "pass": True})
        self.assertEqual(self.statuses()["A2 Độ trễ"], NONE)

    def test_an_unchecked_install_item_is_not_done(self):
        self.complete()
        self.write("a6-checklist.md", "- [x] Gatekeeper\n- [ ] SmartScreen\n")
        self.assertEqual(self.statuses()["A6 Cài đặt"], NONE)

    def test_the_templates_read_as_not_tried_yet(self):
        here = os.path.dirname(os.path.abspath(__file__))
        for name in ("a1-matrix", "a6-checklist"):
            with open(os.path.join(here, f"{name}.template.md"), encoding="utf-8") as f:
                self.write(f"{name}.md", f.read())
        rows = {name: (status, detail) for name, status, _, detail in build(self.dir, self.plan)}
        self.assertEqual(rows["A1 Tương thích"], (NONE, "27 ô: đạt 0, không đạt 0, chưa thử 27"))
        self.assertEqual(rows["A6 Cài đặt"], (NONE, "0/8 mục"))

    def test_an_open_mapping_row_blocks_acceptance(self):
        self.complete()
        self.write("plan.md", PLAN_OPEN)
        self.assertEqual(self.statuses()["Bảng đối chiếu (kế hoạch 00, Task 5)"], FAIL)
        self.assertFalse(render(build(self.dir, self.plan))[1])


if __name__ == "__main__":
    unittest.main()
