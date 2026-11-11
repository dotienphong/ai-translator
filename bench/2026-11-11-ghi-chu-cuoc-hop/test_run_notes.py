import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from run_notes import run_job  # noqa: E402


def L(seq, words, dropped=False):
    return {"seq": seq, "t": 0, "speaker": None, "src": " ".join(["w"] * words), "tgt": None, "dropped": dropped}


def count(s):
    return len(s.split())  # "[1] w w w w" = 5


OK1 = json.dumps({"summary": "s1", "decisions": [{"text": "d1", "refs": [1]}], "action_items": [], "open_questions": []})
OK2 = json.dumps({"summary": "s2", "decisions": [{"text": "d2", "refs": [3]}], "action_items": [], "open_questions": []})
ALL = json.dumps({"summary": "all", "decisions": [{"text": "d", "refs": [1, 3]}], "action_items": [], "open_questions": []})


def job(lines, replies, budget=10):
    seen = []

    def call(messages, max_tokens):
        seen.append(messages)
        return replies[len(seen) - 1]
    return run_job(lines, "vi", budget, count, call, 800, 1500), seen


class Job(unittest.TestCase):
    def test_single_chunk(self):
        r, seen = job([L(1, 4)], [OK1])
        self.assertEqual((r["notes"]["summary"], r["chunks"], len(seen)), ("s1", 1, 1))
        self.assertIn("Write the notes in Vietnamese", seen[0][0]["content"])

    def test_retry_then_raw_fallback(self):
        r, seen = job([L(1, 4)], ["oops", "still bad"])
        self.assertEqual((r["notes"], r["raw_fallback"]), (None, "still bad"))
        self.assertEqual(r["calls"], [{"kind": "map", "valid_first": False, "valid": False}])
        self.assertEqual([m["role"] for m in seen[1]], ["user", "assistant", "user"])
        self.assertEqual(seen[1][1]["content"], "oops")

    def test_retry_succeeds(self):
        r, _ = job([L(1, 4)], ["oops", OK1])
        self.assertEqual(r["calls"], [{"kind": "map", "valid_first": False, "valid": True}])

    def test_map_reduce(self):
        r, seen = job([L(1, 4), L(2, 4), L(3, 4)], [OK1, OK2, ALL])
        self.assertEqual((r["chunks"], len(seen), r["notes"]["decisions"][0]["refs"]), (2, 3, [1, 3]))
        self.assertNotIn("_stats", seen[2][0]["content"])

    def test_reduce_fails_merges_mechanically(self):
        r, _ = job([L(1, 4), L(2, 4), L(3, 4)], [OK1, OK2, "bad", "bad"])
        self.assertTrue(r["reduce_fallback"])
        self.assertEqual((r["notes"]["summary"], [d["text"] for d in r["notes"]["decisions"]]), ("s1\ns2", ["d1", "d2"]))

    def test_failed_chunk_is_skipped(self):
        r, seen = job([L(1, 4), L(2, 4), L(3, 4)], ["bad", "bad", OK2])
        self.assertEqual((r["failed_chunks"], r["notes"]["summary"], len(seen)), (1, "s2", 3))

    def test_empty_transcript_calls_nothing(self):
        r, seen = job([L(1, 3, dropped=True)], [])
        self.assertEqual((r["notes"]["summary"], r["notes"]["decisions"], r["chunks"], seen), ("", [], 0, []))


if __name__ == "__main__":
    unittest.main()
