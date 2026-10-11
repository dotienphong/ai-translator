"""Test của `run_sessions.py` và `summarize_sessions.py` (kế hoạch 01 của "dịch trong lúc người nói chưa dừng").

Chạy:  python3 -m unittest discover -s bench/2026-10-10-do-tre -p 'test_*.py' -v
"""
import os
import tempfile
import unittest

import run_sessions
import summarize_sessions as S


class RunSessionsTest(unittest.TestCase):
    def test_only_sidecars_started_from_the_worktree_count_as_strays(self):
        ps = "\n".join([
            "  101 /w/src-tauri/binaries/asr-worker-aarch64-apple-darwin",
            "  102 /Applications/AI Translator.app/Contents/MacOS/llama-server -m x.gguf",
            "  103 /w/target/release/latency-bench session --asr-worker /w/src-tauri/binaries/asr-worker",
            "  104 /w/src-tauri/binaries/llama-server-aarch64-apple-darwin -m /w/models/m.gguf",
            "  105 /other/src-tauri/binaries/asr-worker-aarch64-apple-darwin",
            "dòng hỏng",
        ])
        self.assertEqual([pid for pid, _ in run_sessions.strays(ps, {"/w"})], [101, 104])

    def test_the_committed_copy_drops_only_the_events(self):
        report = {"args": {}, "machine": {}, "summary": {"a2_p50_ms": 1.0}, "utterances": [], "events": [{"t_ms": 1}]}
        self.assertEqual(sorted(run_sessions.slim(report)), ["args", "machine", "summary", "utterances"])

    def test_existing_results_flags_only_sessions_that_already_have_a_file(self):
        with tempfile.TemporaryDirectory() as d:
            open(os.path.join(d, "buoc1-moc-chuan-en.json"), "w", encoding="utf-8").close()
            self.assertEqual(
                run_sessions.existing_results("buoc1-moc", "chuan", ["en", "vi"], results_dir=d),
                ["buoc1-moc-chuan-en"])

    def test_existing_results_empty_when_nothing_was_run_yet(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(run_sessions.existing_results("buoc1-moc", "chuan", ["en", "vi"], results_dir=d), [])


class SummarizeSessionsTest(unittest.TestCase):
    def test_cells(self):
        self.assertEqual(S.cell("a2_p50_ms", 1234.6), "1235")
        self.assertEqual(S.cell("busy_ratio", 0.1234), "12.3%")
        self.assertEqual(S.cell("cpu_percent", 2.345), "2.3")
        self.assertEqual(S.cell("cadence_p50_ms", None), "—")

    def test_percentile_matches_numpy(self):
        self.assertEqual(S.percentile([1, 2, 3, 4], 50), 2.5)
        self.assertAlmostEqual(S.percentile([15, 20, 35, 40, 50], 40), 29.0)
        self.assertEqual(S.percentile([7], 90), 7)
        self.assertIsNone(S.percentile([], 50))

    def test_one_row_per_file(self):
        lines = S.session_table([("buoc1-moc-chuan-en", {"summary": {"a2_p50_ms": 1000.4, "busy_ratio": 0.25}})])
        self.assertEqual(len(lines), 3)
        self.assertTrue(lines[2].startswith("| buoc1-moc-chuan-en | 1000 | — | — |"), lines[2])
        self.assertIn("| 25.0% |", lines[2])

    def test_words_are_pooled_by_run_group_and_source_language(self):
        reports = [
            ("buoc1-moc-chuan-en", {"utterances": [
                {"lang": "en", "word_lag_tentative_ms": [100, 300], "word_lag_stable_ms": [900],
                 "first_from_start_ms": 1500},
            ]}),
            ("buoc1-moc-chuan-mixed", {"utterances": [
                {"lang": "en", "word_lag_tentative_ms": [200], "word_lag_stable_ms": [],
                 "first_from_start_ms": None},
                {"lang": "ja", "word_lag_tentative_ms": [], "word_lag_stable_ms": [], "first_from_start_ms": None},
            ]}),
        ]
        lines = S.language_table(reports)
        self.assertIn("| buoc1-moc-chuan | en | 3 | 200 | 280 | 900 | 900 | 1500 | 1500 |", lines)
        self.assertIn("| buoc1-moc-chuan | ja | 0 | — | — | — | — | — | — |", lines)

    def test_two_runs_are_compared_session_by_session(self):
        reports = [
            ("buoc1-moc-chuan-en", {"summary": {"a2_p50_ms": 1000.0, "busy_ratio": 0.2}, "run": {"asr_p50_ms": None}}),
            ("buoc1-sau-chuan-en", {"summary": {"a2_p50_ms": 950.4, "busy_ratio": 0.18}, "run": {"asr_p50_ms": 230.0}}),
            ("buoc1-moc-nhe-en", {"summary": {"a2_p50_ms": 800.0}}),
        ]
        lines = S.compare_table(reports, "buoc1-moc", "buoc1-sau")
        self.assertEqual(len(lines), 3, "chỉ session có ở cả hai lượt")
        self.assertTrue(lines[2].startswith("| chuan-en | 1000 → 950 (-50) |"), lines[2])
        self.assertIn("| 20.0% → 18.0% (-2.0) |", lines[2])
        self.assertIn("| — → 230 |", lines[2])


class TargetsTest(unittest.TestCase):
    """Bảng `--targets` (kế hoạch 02): so mục tiêu §10.2 của spec 2026-10-10 theo nhóm lượt chạy."""

    def test_targets_pool_words_by_language_and_flicker_by_units(self):
        reports = [
            ("buoc2-es400-chuan-en", {
                "summary": {"a2_p50_ms": 900.0, "a2_p90_ms": 1500.0, "a2_first_p50_ms": 500.0, "cpu_percent": 12.0},
                "run": {"stable_changed_units": 5, "final_units": 100},
                "utterances": [{"lang": "en", "word_lag_tentative_ms": [800, 1000, 1400],
                                "word_lag_stable_ms": [1500, 2500], "first_from_start_ms": 1500}],
            }),
            ("buoc2-es400-chuan-ja", {
                "summary": {"a2_p50_ms": 1100.0, "a2_p90_ms": 3100.0, "a2_first_p50_ms": 600.0, "cpu_percent": 14.5},
                "run": {"stable_changed_units": 15, "final_units": 100},
                "utterances": [{"lang": "ja", "word_lag_tentative_ms": [1300], "word_lag_stable_ms": [2900],
                                "first_from_start_ms": 2500}],
            }),
        ]
        lines = S.targets_table(reports)
        self.assertIn("| buoc2-es400-chuan | en | 1000 ✓ | 2000 ✓ (≤ 2000) |", lines)
        self.assertIn("| buoc2-es400-chuan | ja | 1300 ✗ | 2900 ✓ (≤ 3000) |", lines)
        self.assertIn("| buoc2-es400-chuan | 2400 ✗ | 10.0% ✓ | 1100 ✓ | 3100 ✗ | 600 ✓ | 14.5 ✓ |", lines)

    def test_flicker_pools_units_not_session_ratios(self):
        """Độ nháy ổn định gộp theo đơn vị: (5 + 15) ÷ (100 + 50) = 13,3%, không phải trung bình tỉ lệ (5% và 30%)."""
        reports = [
            ("g-en", {"summary": {}, "run": {"stable_changed_units": 5, "final_units": 100}, "utterances": []}),
            ("g-ja", {"summary": {}, "run": {"stable_changed_units": 15, "final_units": 50}, "utterances": []}),
        ]
        self.assertIn("| g | — | 13.3% ✗ | — | — | — | — |", S.targets_table(reports))

    def test_missing_numbers_show_a_dash(self):
        lines = S.targets_table([("buoc2-es50-chuan-en", {"summary": {}, "utterances": []})])
        self.assertIn("| buoc2-es50-chuan | — | — | — | — | — | — |", lines)


if __name__ == "__main__":
    unittest.main()
