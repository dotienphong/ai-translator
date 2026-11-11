import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from notes_lib import chunk_lines, line_text, parse_markdown_export, prefix, render_lines  # noqa: E402

MD = ("# Bản chép lời · 2026-10-02 14:05\n\n| Giờ | Câu gốc | Bản dịch |\n|---|---|---|\n"
      "| 14:05:01 | **Lan:** Good morning, everyone. | Chào buổi sáng mọi người. |\n"
      "| 14:05:09 | Xin chào. |  |\n"
      "| 14:05:15 | \\[bỏ qua đoạn\\] |  |\n"
      "| 14:20:01 | **Người 2:** The \\*final\\* \\| answer | (chưa dịch được) |\n")


def L(seq, words, dropped=False):
    return {"seq": seq, "t": 0, "speaker": None, "src": " ".join(["w"] * words), "tgt": None, "dropped": dropped}


def count(s):
    return len(s.split())  # "[1] w w w w" = 5


class Export(unittest.TestCase):
    def test_parse(self):
        lines = parse_markdown_export(MD)
        self.assertEqual(lines[0], {"seq": 1, "t": 0, "speaker": "Lan", "src": "Good morning, everyone.",
                                    "tgt": "Chào buổi sáng mọi người.", "dropped": False})
        self.assertEqual((lines[1]["speaker"], lines[1]["tgt"]), (None, None))
        self.assertTrue(lines[2]["dropped"])
        self.assertEqual((lines[3]["speaker"], lines[3]["src"], lines[3]["tgt"], lines[3]["t"]),
                         ("Người 2", "The *final* | answer", None, 900))
        self.assertEqual(parse_markdown_export(""), [])

    def test_clock_wraps_at_midnight(self):
        md = MD.split("| 14:05:01")[0] + "| 23:59:50 | a |  |\n| 00:00:10 | b |  |\n"
        self.assertEqual([l["t"] for l in parse_markdown_export(md)], [0, 20])

    def test_prefix_and_render(self):
        lines = parse_markdown_export(MD)
        self.assertEqual([l["seq"] for l in prefix(lines, 10)], [1, 2, 3])
        self.assertEqual(render_lines(lines),
                         "[1] Lan: Chào buổi sáng mọi người.\n[2] Xin chào.\n[4] Người 2: The *final* | answer\n")


class Chunk(unittest.TestCase):
    def seqs(self, chunks):
        return [[l["seq"] for l in c] for c in chunks]

    def test_greedy_by_budget(self):
        self.assertEqual(self.seqs(chunk_lines([L(1, 4), L(2, 4), L(3, 4)], 10, count)), [[1, 2], [3]])

    def test_oversize_line_gets_its_own_chunk(self):
        self.assertEqual(self.seqs(chunk_lines([L(1, 50), L(2, 2)], 10, count)), [[1], [2]])

    def test_dropped_and_empty(self):
        self.assertEqual(chunk_lines([], 10, count), [])
        self.assertEqual(chunk_lines([L(1, 3, dropped=True)], 10, count), [])
        self.assertEqual(self.seqs(chunk_lines([L(1, 3), L(2, 3, dropped=True), L(3, 3)], 10, count)), [[1, 3]])


if __name__ == "__main__":
    unittest.main()
