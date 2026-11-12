import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from notes_lib import owner_known, parse_verdicts, render_verify_lines  # noqa: E402
from run_notes import run_job  # noqa: E402


def L(seq, src, tgt=None, speaker=None, dropped=False):
    return {"seq": seq, "t": 0, "speaker": speaker, "src": src, "tgt": tgt, "dropped": dropped}


LINES = [L(1, "a b", "A B", "Lan"), L(2, "c d", None, "Minh"), L(3, "e", "E"), L(4, "f", "F", dropped=True),
         L(5, "g", "G"), L(6, "h", "H"), L(7, "i", "I"), L(8, "j", "J")]


class Render(unittest.TestCase):
    def test_neighbours_original_and_translation(self):
        out = render_verify_lines(LINES, [2], around=1)
        self.assertEqual(out, "[1] Lan: a b\n    → A B\n[2] Minh: c d\n[3] e\n    → E\n")

    def test_skips_dropped_and_merges_windows(self):
        out = render_verify_lines(LINES, [3, 5], around=1)
        self.assertEqual([l.split("]")[0] for l in out.splitlines() if l.startswith("[")], ["[2", "[3", "[5", "[6"])


class Verdict(unittest.TestCase):
    def test_parses_by_number(self):
        v = parse_verdicts('x {"items": [{"n": 2, "keep": true, "owner": " Lan ", "due": ""}, {"n": 1, "keep": false}]} y')
        self.assertEqual(v, {2: {"keep": True, "owner": "Lan", "due": ""}, 1: {"keep": False, "owner": "", "due": ""}})

    def test_skips_bad_entries(self):
        self.assertEqual(parse_verdicts('{"items": [{"n": 1, "keep": "yes"}, {"keep": true}, 3]}'), {})

    def test_not_an_items_object(self):
        self.assertIsNone(parse_verdicts('{"keep": true}'))
        self.assertIsNone(parse_verdicts("no json"))


class Owner(unittest.TestCase):
    def test_known_by_speaker_or_text(self):
        self.assertTrue(owner_known("lan", LINES))
        self.assertTrue(owner_known("C D", LINES))   # có trong câu gốc
        self.assertFalse(owner_known("Hoa", LINES))


def count(s):
    return len(s.split())


NOTES = json.dumps({"summary": "s", "decisions": [], "open_questions": [], "action_items": [
    {"text": "t1", "owner": "Lan", "due": "", "refs": [1]},
    {"text": "t2", "owner": "", "due": "", "refs": [2]},
    {"text": "t3", "owner": "", "due": "", "refs": []},
    {"text": "t4", "owner": "Minh", "due": "x", "refs": [5]}]})


class VerifyJob(unittest.TestCase):
    def run_with(self, replies, verify_budget=1000):
        seen = []

        def call(messages, max_tokens, schema=None):
            seen.append((messages, schema))
            return replies[len(seen) - 1]
        r = run_job(LINES, "vi", 1000, count, call, 800, 1500, verify=True, map_prompt="map_v2.txt",
                    verify_budget=verify_budget)
        return r, seen

    def test_one_batch_drop_edit_missing(self):
        r, seen = self.run_with([
            NOTES,
            json.dumps({"items": [
                {"n": 1, "keep": True, "owner": "Hoa", "due": "thứ Hai"},   # owner lạ → ""
                {"n": 2, "keep": False, "owner": "", "due": ""},
                # n = 3 (t4) không có trong trả lời: giữ nguyên
            ]}),
        ])
        items = r["notes"]["action_items"]
        self.assertEqual([(i["text"], i["owner"], i["due"]) for i in items], [("t1", "", "thứ Hai"), ("t4", "Minh", "x")])
        self.assertEqual(r["verify"], {"checked": 3, "dropped": 1, "edited": 1, "unparsed": 1, "no_refs": 1})
        self.assertEqual([c["kind"] for c in r["calls"]], ["map", "verify"])
        prompt = seen[1][0][0]["content"]
        self.assertIsNotNone(seen[1][1])                       # lượt kiểm dùng schema riêng
        self.assertIn("[1] Lan: a b", prompt)
        self.assertIn('"n": 3', prompt)
        self.assertIn("Vietnamese", prompt)

    def test_due_in_cjk_is_not_taken(self):
        r, _ = self.run_with([NOTES, json.dumps({"items": [
            {"n": 1, "keep": True, "owner": "Lan", "due": "金曜日"}, {"n": 2, "keep": True, "owner": "", "due": ""},
            {"n": 3, "keep": True, "owner": "Minh", "due": "x"}]})])
        self.assertEqual(r["notes"]["action_items"][0]["due"], "")
        self.assertEqual(r["verify"]["edited"], 0)

    def test_unreadable_reply_keeps_all(self):
        r, seen = self.run_with([NOTES, "bad", "still bad"])
        self.assertEqual(len(r["notes"]["action_items"]), 3)
        self.assertEqual(r["verify"]["unparsed"], 3)
        self.assertEqual(r["calls"][-1], {"kind": "verify", "valid_first": False, "valid": False})

    def test_items_split_into_batches_by_budget(self):
        # Mỗi việc kéo theo vài câu; ngân sách nhỏ buộc chia mỗi việc một lượt.
        replies = [NOTES] + [json.dumps({"items": [{"n": 1, "keep": True, "owner": "", "due": ""}]})] * 3
        r, seen = self.run_with(replies, verify_budget=12)
        self.assertEqual([c["kind"] for c in r["calls"]], ["map", "verify", "verify", "verify"])
        self.assertEqual(r["verify"]["checked"], 3)

    def test_off_by_default(self):
        seen = []

        def call(messages, max_tokens):
            seen.append(messages)
            return NOTES
        r = run_job(LINES, "vi", 1000, count, call, 800, 1500)
        self.assertEqual((len(seen), len(r["notes"]["action_items"]), r.get("verify")), (1, 4, None))


P1 = json.dumps({"summary": "s1", "decisions": [{"text": "D", "refs": [1]}], "open_questions": [],
                 "action_items": [{"text": "Gửi báo giá", "owner": "Lan", "due": "", "refs": [1]}]})
P2 = json.dumps({"summary": "s2", "decisions": [{"text": "d ", "refs": [6]}], "open_questions": [],
                 "action_items": [{"text": "gửi báo giá", "owner": "", "due": "", "refs": [5]},
                                  {"text": "In thiệp", "owner": "", "due": "", "refs": [6]}]})


class SummaryReduce(unittest.TestCase):
    def run_with(self, replies):
        seen = []

        def call(messages, max_tokens, schema=None):
            seen.append((messages, schema))
            return replies[len(seen) - 1]
        r = run_job(LINES, "vi", 10, count, call, 800, 1500, reduce_mode="summary")
        return r, seen

    def test_items_merged_mechanically_summary_from_model(self):
        r, seen = self.run_with([P1, P2, '{"summary": "cả buổi"}'])
        n = r["notes"]
        self.assertEqual(n["summary"], "cả buổi")
        self.assertEqual([(d["text"], d["refs"]) for d in n["decisions"]], [("D", [1, 6])])
        self.assertEqual([(a["text"], a["owner"], a["refs"]) for a in n["action_items"]],
                         [("Gửi báo giá", "Lan", [1, 5]), ("In thiệp", "", [6])])
        self.assertIn("s1", seen[2][0][0]["content"])
        self.assertNotIn("báo giá", seen[2][0][0]["content"])   # lượt gộp chỉ thấy phần tóm tắt
        self.assertEqual([c["kind"] for c in r["calls"]], ["map", "map", "reduce"])

    def test_summary_fails_joins_parts(self):
        r, _ = self.run_with([P1, P2, "bad", "bad"])
        self.assertEqual(r["notes"]["summary"], "s1\ns2")
        self.assertTrue(r["reduce_fallback"])


class Around(unittest.TestCase):
    def test_verify_around_is_used(self):
        seen = []

        def call(messages, max_tokens, schema=None):
            seen.append(messages)
            return [NOTES, json.dumps({"items": [{"n": 1, "keep": True, "owner": "Lan", "due": ""}]})][min(len(seen) - 1, 1)]
        run_job(LINES, "vi", 1000, count, call, 800, 1500, verify=True, verify_budget=1, verify_around=0)
        self.assertNotIn("[2]", seen[1][0]["content"].split("Items:")[0])   # chỉ câu [1] cho việc t1


if __name__ == "__main__":
    unittest.main()
