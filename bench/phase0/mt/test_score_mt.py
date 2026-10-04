"""Test của score_mt.py, phần so với mốc (Q8 của review 02b). Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase0/mt -p 'test_*.py'
"""
import importlib.util
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score_mt import chrf_pp, regression_lines, summarize  # noqa: E402

BASE = {"runs": {"Q4_K_M-plain": {"en->vi": {"comet": 0.84}, "zh->vi": {"comet": 0.80}},
                 "Q8_0-plain": {"en->vi": {"comet": 0.85}}}}


class RegressionLines(unittest.TestCase):
    def test_every_direction_is_compared(self):
        report = {"Q4_K_M-plain": {"en->vi": {"comet": 0.835}, "zh->vi": {"comet": 0.81}}}
        lines, regressed, missing = regression_lines(report, BASE)
        self.assertEqual((regressed, missing), (False, []))
        self.assertEqual(sum(l.startswith("| Q4_K_M-plain |") for l in lines), 2)

    def test_more_than_0_01_below_the_baseline_regresses(self):
        report = {"Q4_K_M-plain": {"en->vi": {"comet": 0.829}, "zh->vi": {"comet": 0.80}}}
        _, regressed, missing = regression_lines(report, BASE)
        self.assertEqual((regressed, missing), (True, []))

    def test_a_missing_direction_cannot_pass(self):
        report = {"Q4_K_M-plain": {"en->vi": {"comet": 0.84}}}
        _, regressed, missing = regression_lines(report, BASE)
        self.assertFalse(regressed)
        self.assertEqual(missing, ["Q4_K_M-plain: thiếu chiều zh->vi"])

    def test_scores_without_comet_cannot_pass(self):
        report = {"Q4_K_M-plain": {"en->vi": {"n": 1}, "zh->vi": {"n": 1}}}
        _, _, missing = regression_lines(report, BASE)
        self.assertEqual(len(missing), 2)
        self.assertIn("không có COMET", missing[0])

    def test_no_run_with_the_baseline_name_cannot_pass(self):
        _, _, missing = regression_lines({"Q4_K_M-gd1-plain": {"en->vi": {"comet": 0.9}}}, BASE)
        self.assertEqual(len(missing), 1)
        self.assertIn("không lượt nào trùng tên", missing[0])


class Summarize(unittest.TestCase):
    def test_failed_rows_do_not_skew_the_timings_or_ratios(self):
        items = {"a": {"src": "x"}, "b": {"src": "y"}}
        rows = [{"id": "a", "hyp": "X", "src_tokens": 10, "completion_tokens": 12, "total_ms": 400.0,
                 "finish_reason": "stop"},
                {"id": "b", "hyp": "y", "src_tokens": 10, "completion_tokens": 0, "total_ms": 0.0,
                 "finish_reason": "failed"}]
        r = summarize(rows, None, items)
        self.assertEqual((r["n"], r["failed"], r["total_ms_p50"], r["token_ratio_max"]), (2, 1, 400.0, 1.2))


HAS_SACREBLEU = importlib.util.find_spec("sacrebleu") is not None


@unittest.skipUnless(HAS_SACREBLEU, "cần sacrebleu: uv run --no-project --python 3.12 --with sacrebleu==2.6.0 ...")
class ChrfPlusPlus(unittest.TestCase):
    ITEMS = {"a": {"src": "s", "ref": "Chào buổi sáng, mọi người."}, "b": {"src": "s", "ref": "Hẹn gặp lại vào tuần sau."}}

    def rows(self, hyp_a, hyp_b):
        base = {"src_tokens": 5, "completion_tokens": 5, "total_ms": 100.0, "finish_reason": "stop"}
        return [dict(base, id="a", hyp=hyp_a), dict(base, id="b", hyp=hyp_b)]

    def test_identical_text_scores_100_and_a_different_one_scores_less(self):
        same = chrf_pp(self.rows("Chào buổi sáng, mọi người.", "Hẹn gặp lại vào tuần sau."), self.ITEMS)
        worse = chrf_pp(self.rows("Xin chào các bạn.", "Tạm biệt nhé."), self.ITEMS)
        self.assertAlmostEqual(same, 100.0)
        self.assertLess(worse, same)

    def test_it_is_chrf_plus_plus_not_plain_chrf(self):
        from sacrebleu.metrics import CHRF

        items = {"a": {"src": "s", "ref": "the cat sat on the mat today"}}
        rows = [{"id": "a", "hyp": "mat the on sat cat the today", "src_tokens": 5, "completion_tokens": 5,
                 "total_ms": 1.0, "finish_reason": "stop"}]
        plain = CHRF(word_order=0).corpus_score(["mat the on sat cat the today"], [["the cat sat on the mat today"]]).score
        self.assertNotAlmostEqual(chrf_pp(rows, items), plain)

    def test_summarize_reports_chrf_only_when_every_row_has_a_reference(self):
        rows = self.rows("Chào buổi sáng, mọi người.", "Hẹn gặp lại vào tuần sau.")
        self.assertAlmostEqual(summarize(rows, None, self.ITEMS)["chrf"], 100.0)
        no_ref = {"a": {"src": "s"}, "b": {"src": "s", "ref": "x"}}
        self.assertNotIn("chrf", summarize(rows, None, no_ref))


if __name__ == "__main__":
    unittest.main()
