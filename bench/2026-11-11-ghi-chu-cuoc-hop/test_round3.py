import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from grading import score  # noqa: E402
from notes_lib import due_supported, render_lines  # noqa: E402
from run_notes import run_job  # noqa: E402


def L(seq, src, tgt=None, speaker=None):
    return {"seq": seq, "t": 0, "speaker": speaker, "src": src, "tgt": tgt, "dropped": False}


LINES = [L(1, "金曜の１４日までに送ります", "I will send it by Friday the 15th", "高橋"), L(2, "了解", "OK"),
         L(3, "十二月に", "in December")]


class Source(unittest.TestCase):
    def test_render_source(self):
        self.assertEqual(render_lines(LINES[:1], source=True), "[1] 高橋: 金曜の１４日までに送ります\n")
        self.assertEqual(render_lines(LINES[:1]), "[1] 高橋: I will send it by Friday the 15th\n")

    def test_map_reads_source(self):
        seen = []

        def call(messages, max_tokens, schema=None):
            seen.append(messages)
            return json.dumps({"summary": "s", "decisions": [], "action_items": [], "open_questions": []})
        run_job(LINES, "vi", 1000, lambda s: len(s.split()), call, 800, 1500, map_prompt="map_v3.txt", map_source=True)
        self.assertIn("金曜の１４日", seen[0][0]["content"])
        self.assertNotIn("Friday the 15th", seen[0][0]["content"])


class Due(unittest.TestCase):
    def test_numbers_must_be_in_original(self):
        self.assertTrue(due_supported("thứ Sáu 14", LINES, [1]))      # １４ toàn khổ = 14
        self.assertFalse(due_supported("thứ Sáu 15", LINES, [1]))
        self.assertTrue(due_supported("thứ Sáu", LINES, [1]))         # không có số: không kiểm được
        self.assertTrue(due_supported("", LINES, [1]))

    def test_window_is_one_line_around(self):
        self.assertTrue(due_supported("14", LINES, [2]))
        self.assertFalse(due_supported("14", LINES, [3]))

    def test_job_clears_unsupported_due(self):
        notes = json.dumps({"summary": "s", "decisions": [], "open_questions": [], "action_items": [
            {"text": "gửi báo cáo", "owner": "高橋", "due": "thứ Sáu 15", "refs": [1]},
            {"text": "x", "owner": "", "due": "14", "refs": [1]}]})
        r = run_job(LINES, "vi", 1000, lambda s: len(s.split()), lambda m, t, schema=None: notes, 800, 1500,
                    due_check=True)
        self.assertEqual([a["due"] for a in r["notes"]["action_items"]], ["", "14"])
        self.assertEqual(r["due_cleared"], 1)


KEY = {"t1": {"A": "x", "B": "y"}}


def row(he, dung, loi, nhom=""):
    return {"name": "t1", "he": he, "loai": "action", "refs": "", "dung": dung, "refs_dung": "", "nhom": nhom,
            "loai_loi": loi}


class GradeKinds(unittest.TestCase):
    def test_counts_fabricated_apart_from_wrong_detail(self):
        s = score([row("A", "0", "bia"), row("A", "0", "chi_tiet"), row("B", "1", "", "g")], KEY)
        self.assertEqual((s["x"]["bia"], s["x"]["bia_han"], s["x"]["sai_chi_tiet"]), (2, 1, 1))
        self.assertEqual(s["y"]["bia_han"], 0)

    def test_wrong_action_needs_a_kind_when_column_exists(self):
        with self.assertRaises(ValueError):
            score([row("A", "0", "")], KEY)


if __name__ == "__main__":
    unittest.main()
