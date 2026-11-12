import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from grading import score  # noqa: E402

KEY = {"t1": {"A": "local", "B": "cloud"}}


def row(he, loai, dung, refs_dung, nhom, refs="1"):
    return {"name": "t1", "he": he, "loai": loai, "refs": refs, "dung": dung, "refs_dung": refs_dung, "nhom": nhom}


ROWS = [row("A", "action", "1", "1", "1"), row("A", "action", "0", "", ""), row("A", "decision", "1", "0", ""),
        row("B", "action", "1", "1", "1"), row("B", "action", "1", "1", "2")]


class Score(unittest.TestCase):
    def test_score(self):
        s = score(ROWS, KEY)
        self.assertEqual((s["local"]["bia"], s["cloud"]["bia"]), (1, 0))
        self.assertEqual((s["local"]["refs_dung"], s["cloud"]["refs_dung"]), (0.5, 1.0))
        self.assertEqual((s["local"]["recall"], s["cloud"]["recall"]), (0.5, 1.0))

    def test_blank_grade_is_an_error(self):
        with self.assertRaises(ValueError):
            score([row("A", "action", "", "", "")], KEY)

    def test_correct_action_without_group_is_an_error(self):
        with self.assertRaises(ValueError):
            score([row("A", "action", "1", "1", "")], KEY)


if __name__ == "__main__":
    unittest.main()
