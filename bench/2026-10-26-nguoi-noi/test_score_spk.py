"""cd bench/2026-10-26-nguoi-noi && python -m unittest test_score_spk (hay `python -I test_score_spk.py`;
`-I -m unittest` không tìm thấy module test vì chế độ cô lập bỏ thư mục hiện tại khỏi đường dẫn)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score_spk import score  # noqa: E402

TURNS = [(0.0, 2.0, "A"), (2.0, 4.0, "B")]


def segs(*rows):
    return [{"start_ms": a, "end_ms": b, "voice": v} for a, b, v in rows]


class ScoreTest(unittest.TestCase):
    def test_perfect_labels(self):
        s = score(segs((0, 2000, 1), (2000, 4000, 2)), TURNS)
        self.assertAlmostEqual(s["time"], 1.0)
        self.assertAlmostEqual(s["line_all"], 1.0)
        self.assertEqual(s["voices"], 2)

    def test_label_names_do_not_matter(self):
        s = score(segs((0, 2000, 7), (2000, 4000, 3)), TURNS)
        self.assertAlmostEqual(s["line_all"], 1.0)

    def test_one_voice_for_everyone_is_half_right(self):
        s = score(segs((0, 2000, 1), (2000, 4000, 1)), TURNS)
        self.assertAlmostEqual(s["time"], 0.5)
        self.assertAlmostEqual(s["line_all"], 0.5)

    def test_unlabelled_segment_counts_as_wrong(self):
        s = score(segs((0, 2000, 1), (2000, 4000, None)), TURNS)
        self.assertAlmostEqual(s["line_all"], 0.5)

    def test_segment_spanning_two_speakers_lowers_purity(self):
        s = score(segs((1000, 3000, 1)), TURNS)
        self.assertAlmostEqual(s["purity"], 0.5)

    def test_more_voices_than_speakers(self):
        # Ba giọng cho hai người (TURNS: A 0-2 s, B 2-4 s). Đoạn (giây): 0-1,2 giọng 1; 1,2-2 giọng 3; 2-4 giọng 2.
        # Ma trận trùng (giây): giọng 1 - A 1,2; giọng 2 - B 2,0; giọng 3 - A 0,8. Ghép Hungarian (mỗi giọng một người):
        # 1 -> A, 2 -> B; giọng 3 không có người để ghép (1,2 > 0,8 nên giọng 1 thắng A, không hòa).
        # - time = (1,2 + 2,0) / 4,0 = 0,8 (đoạn giọng 3 tính vào mẫu số, không vào tử số);
        # - line_all = 2/3 (đoạn giọng 3 sai); line_1s chỉ xét đoạn ≥ 1 s (0-1,2 và 2-4): cả hai đúng nên 1,0;
        # - purity = 1,0 (mỗi đoạn chỉ nằm trong lượt của một người); voices = 3, speakers = 2.
        s = score(segs((0, 1200, 1), (1200, 2000, 3), (2000, 4000, 2)), TURNS)
        self.assertAlmostEqual(s["time"], 0.8)
        self.assertAlmostEqual(s["line_all"], 2 / 3)
        self.assertAlmostEqual(s["line_1s"], 1.0)
        self.assertAlmostEqual(s["purity"], 1.0)
        self.assertEqual(s["voices"], 3)
        self.assertEqual(s["speakers"], 2)

    def test_segment_outside_every_turn_is_ignored_but_its_voice_counts(self):
        # Đoạn 5-6 s (giọng 3) nằm ngoài mọi lượt của TURNS (hết ở 4 s) nên không có trùng nào: không vào time (mẫu số vẫn
        # 2,0 + 2,0 = 4,0), line_all (vẫn 2/2 chứ không phải 2/3), line_1s (dù đúng 1 s), purity; nhưng giọng 3 vẫn được đếm
        # vào voices (3 giọng) vì app đã hiện nó ra.
        s = score(segs((0, 2000, 1), (2000, 4000, 2), (5000, 6000, 3)), TURNS)
        self.assertAlmostEqual(s["time"], 1.0)
        self.assertAlmostEqual(s["line_all"], 1.0)
        self.assertAlmostEqual(s["line_1s"], 1.0)
        self.assertAlmostEqual(s["purity"], 1.0)
        self.assertEqual(s["voices"], 3)
        self.assertEqual(s["speakers"], 2)


if __name__ == "__main__":
    unittest.main()
