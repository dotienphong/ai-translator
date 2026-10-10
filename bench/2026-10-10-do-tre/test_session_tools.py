"""Test của `run_sessions.py` và `summarize_sessions.py` (kế hoạch 01 của "dịch trong lúc người nói chưa dừng").

Chạy:  python3 -m unittest discover -s bench/2026-10-10-do-tre -p 'test_*.py' -v
"""
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


if __name__ == "__main__":
    unittest.main()
