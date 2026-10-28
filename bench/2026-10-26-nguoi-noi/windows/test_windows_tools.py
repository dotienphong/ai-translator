"""cd bench/2026-10-26-nguoi-noi/windows && python3 -I -B test_windows_tools.py : kiểm hai công cụ phân tích bản ghi Windows."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import re  # noqa: E402

from liet_ke_hinh_dang import onsets, table  # noqa: E402
from tom_tat_do import summarize  # noqa: E402


def row(depth, role, ident="", cls="", title=""):
    return f"{depth}|{role}||{title}|||{ident}||" + f"|{cls}"


class ToolsTest(unittest.TestCase):
    def test_summary_counts_passes_statuses_and_slow_ones(self):
        rows = [
            {"t": 1, "pass": "Full", "ms": 12.0, "elements": 80, "status": "Ok", "tiles": 3, "timeouts": 0, "denied": 0},
            {"t": 2, "pass": "Fast", "ms": 40.0, "elements": 9, "status": "Ok", "tiles": 3, "timeouts": 1, "denied": 0},
            {"t": 3, "pass": "Idle", "ms": 0.1, "elements": 0, "status": "NoMeeting", "tiles": 0, "timeouts": 0, "denied": 2},
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8") as f:
            f.write("\n".join(json.dumps(r) for r in rows) + "\n")
        try:
            text = summarize(f.name)
        finally:
            os.unlink(f.name)
        self.assertIn("3 lượt", text)
        self.assertIn("lượt đầy đủ: 1 lượt, p50 12.0 ms", text)
        self.assertIn("quá 30 ms: 1", text)
        self.assertIn("NoMeeting 1, Ok 2", text)
        self.assertIn("lệnh quá hạn: 1, bị chặn: 2", text)

    def test_shape_table_hides_text_and_counts_snapshots(self):
        snaps = [
            {"t": 0.0, "lines": [row(0, "Window", title="Tên người"), row(1, "MenuItem", cls="fui-Flex", title="Lan, muted")]},
            {"t": 1.0, "lines": [row(0, "Window"), row(1, "MenuItem", cls="fui-Flex"), row(2, "Group", cls="vdi-frame-occlusion")]},
        ]
        seen, count, depth = table(snaps)
        self.assertEqual(seen[("MenuItem", "", "", "fui-Flex")], 2)
        self.assertEqual(seen[("Group", "", "", "vdi-frame-occlusion")], 1)
        self.assertEqual(depth[("Group", "", "", "vdi-frame-occlusion")], {2})

    def test_label_filter_keeps_only_matching_shapes(self):
        snaps = [{"t": 0.0, "lines": [row(1, "MenuItem", cls="fui-Flex", title="Lan, Context menu is available"), row(1, "Button", title="Chat")]}]
        seen, _, _ = table(snaps, re.compile(r"Context menu"))
        self.assertEqual(list(seen), [("MenuItem", "", "", "fui-Flex")])

    def test_onset_is_the_first_appearance_after_each_switch_on(self):
        snaps = [{"t": 100.0 + 0.5 * i, "lines": [row(1, "Group", cls="vdi-frame-occlusion")] if 3 <= i < 8 else [row(1, "Group")]} for i in range(12)]
        truth = {"steps": [{"t": 101.0, "g": "Lan", "on": True}, {"t": 103.0, "g": "Lan", "on": False}]}
        got = onsets(snaps, "vdi-frame-occlusion", truth)
        self.assertEqual(list(got), ["Lan"])
        self.assertAlmostEqual(got["Lan"][0], 0.5, places=3)


if __name__ == "__main__":
    unittest.main()
