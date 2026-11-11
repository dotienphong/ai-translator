import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from notes_lib import (EMPTY_NOTES, chunk_lines, lang_ok, line_text, parse_markdown_export, parse_notes,  # noqa: E402
                       prefix, render_lines)

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


LINES = [{"seq": 1, "t": 0, "speaker": "Lan", "src": "x", "tgt": "Minh gửi báo cáo thứ Sáu", "dropped": False},
         {"seq": 2, "t": 5, "speaker": None, "src": "y", "tgt": None, "dropped": False},
         {"seq": 3, "t": 9, "speaker": None, "src": "z", "tgt": None, "dropped": True}]
GOOD = {"summary": "S", "decisions": [{"text": "D", "refs": [1, "2", 99, "1-2", 1, 3]}],
        "action_items": [{"text": "A", "owner": "minh", "due": "thứ Sáu", "refs": [1]},
                         {"text": "B", "owner": "Bob", "due": None, "refs": []},
                         {"text": "  ", "owner": "", "due": "", "refs": [1]}],
        "open_questions": []}


class Parse(unittest.TestCase):
    def test_normalizes(self):
        n = parse_notes(json.dumps(GOOD), LINES)
        self.assertEqual(n["decisions"], [{"text": "D", "refs": [1, 2]}])
        self.assertEqual(n["action_items"], [{"text": "A", "owner": "minh", "due": "thứ Sáu", "refs": [1]},
                                             {"text": "B", "owner": "", "due": "", "refs": []}])
        self.assertEqual(n["_stats"], {"refs_total": 7, "refs_invalid": 3, "owners_cleared": 1})

    def test_wrappers(self):
        body = json.dumps(GOOD)
        for raw in (f"```json\n{body}\n```", f"<think>hmm {{}}</think>\n{body}", f"Here are the notes:\n{body}\nDone."):
            self.assertEqual(parse_notes(raw, LINES)["summary"], "S")

    def test_rejects(self):
        for bad in ("not json", "[]", json.dumps({**GOOD, "decisions": "none"}),
                    json.dumps({k: v for k, v in GOOD.items() if k != "summary"}), json.dumps({**GOOD, "summary": 5})):
            self.assertIsNone(parse_notes(bad, LINES))


class Lang(unittest.TestCase):
    def n(self, text):
        return {**EMPTY_NOTES, "summary": text}

    def test_lang(self):
        vi, en = "Cả nhóm thống nhất lùi hạn sang tuần sau.", "The team agreed to move the deadline to next week."
        self.assertTrue(lang_ok(self.n(vi), "vi"))
        self.assertFalse(lang_ok(self.n(en), "vi"))
        self.assertTrue(lang_ok(self.n(en), "en"))
        self.assertFalse(lang_ok(self.n(vi), "en"))
        self.assertFalse(lang_ok(self.n("团队同意将截止日期推迟到下周。"), "vi"))
        self.assertTrue(lang_ok(self.n(en + " Owner: 田中."), "en"))
        self.assertTrue(lang_ok(EMPTY_NOTES, "vi"))


if __name__ == "__main__":
    unittest.main()
