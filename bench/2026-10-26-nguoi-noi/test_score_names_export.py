import unittest

import score_names_export as s

TURNS = [
    {"name": "An", "start": "10:00:00", "end": "10:00:10"},
    {"name": "Binh", "start": "10:00:12", "end": "10:00:22"},
    {"name": "An", "start": "10:00:30", "end": "10:00:40"},
    {"name": "Binh", "start": "10:00:42", "end": "10:00:52"},
    {"name": "An", "start": "10:01:00", "end": "10:01:10"},
    {"name": "Binh", "start": "10:01:12", "end": "10:01:22"},
    {"name": "An", "start": "10:01:30", "end": "10:01:40"},
]


def export(rows):
    return "\n".join(f"[{t}] {label + ': ' if label else ''}{text}\n→ dịch" for t, label, text in rows)


class ScoreNames(unittest.TestCase):
    def test_parse_export_labels_and_plain_lines(self):
        lines = s.parse_export(export([("10:00:05", "An", "hello there my friend"), ("10:00:15", None, "no label here")]))
        self.assertEqual(lines, [(36005, "An", "hello there my friend"), (36015, None, "no label here")])

    def test_only_turns_after_everyone_spoke_twice_count(self):
        rows = [("10:00:05", "An", "one two three"), ("10:00:15", "Binh", "one two three"), ("10:00:35", "An", "one two three"),
                ("10:00:45", "Binh", "one two three"), ("10:01:05", "An", "one two three"), ("10:01:15", "Binh", "one two three")]
        r = s.score(s.parse_export(export(rows)), TURNS)
        self.assertTrue(r["eligible"])
        self.assertEqual(r["counted"], 2)  # chỉ hai lượt sau khi Binh nói xong lượt thứ hai
        self.assertEqual(r["correct"], 2)

    def test_wrong_generic_none_and_short_lines(self):
        rows = [("10:01:01", "Binh", "one two three"), ("10:01:02", "An", "one two three"), ("10:01:03", "Người 2", "one two three"),
                ("10:01:04", None, "one two three"), ("10:01:05", "An", "ok")]
        r = s.score(s.parse_export(export(rows)), TURNS)
        self.assertEqual((r["correct"], r["wrong"], r["generic"], r["none"], r["counted"]), (1, 1, 1, 1, 4))  # "ok" ngắn bị bỏ

    def test_overlapping_or_gap_lines_are_ignored(self):
        turns = TURNS + [{"name": "Binh", "start": "10:01:09", "end": "10:01:20"}]
        r = s.score(s.parse_export(export([("10:01:10", "An", "one two three"), ("10:00:56", "An", "one two three")])), turns, tol_s=0.5)
        self.assertEqual(r["counted"], 0)

    def test_verdict_thresholds(self):
        ok = {"eligible": True, "counted": 20, "correct": 18, "wrong": 1, "generic": 1, "none": 0}
        self.assertTrue(s.verdict(ok))
        self.assertFalse(s.verdict({**ok, "correct": 17, "generic": 2}))
        self.assertFalse(s.verdict({**ok, "wrong": 2, "generic": 0}))
        self.assertFalse(s.verdict({**ok, "eligible": False}))

    def test_nobody_spoke_enough(self):
        r = s.score([], TURNS[:3])
        self.assertFalse(r["eligible"])

    def test_offset_shifts_export_clock(self):
        rows = [("10:00:58", "An", "one two three"), ("10:01:10", "Binh", "one two three")]
        r = s.score(s.parse_export(export(rows)), TURNS, offset_s=2)
        self.assertEqual((r["counted"], r["correct"]), (2, 2))


if __name__ == "__main__":
    unittest.main()
