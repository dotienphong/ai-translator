"""Test của score_mix.py: uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" \
--with "opencc==1.4.2" python -m unittest bench/2026-10-24-nguon-micro/test_score_mix.py"""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score_mix import assign, best_offset_ms, in_track, kept, score_variant  # noqa: E402

ITEMS = [
    {"source": "online", "lang": "en", "ref": "hello world", "start_ms": 1000, "end_ms": 2000, "short": False},
    {"source": "room", "lang": "vi", "ref": "Đúng rồi.", "start_ms": 3000, "end_ms": 3500, "short": True},
]


def row(start, end, text, short=False, prob=0.9, speech=900, verdict="Speech"):
    return {"verdict": verdict, "short": short, "mean_prob": prob, "speech_ms": speech,
            "start_ms": start, "end_ms": end, "text": text}


class ScoreMix(unittest.TestCase):
    def test_segments_go_to_the_overlapping_clip_and_the_rest_are_phantoms(self):
        rows = [row(1100, 1900, "hello world"), row(5000, 5200, "you", short=True, prob=0.5, speech=200)]
        by, ph = assign(kept(rows, None), ITEMS)
        self.assertEqual(len(by[0]), 1)
        self.assertEqual([p["text"] for p in ph], ["you"])

    def test_short_unsure_drops_short_unsure_rows_only(self):
        rows = [row(5000, 5200, "you", short=True, prob=0.5, speech=200), row(1100, 1900, "hello world")]
        self.assertEqual([r["text"] for r in kept(rows, (0.7, 400))], ["hello world"])

    def test_filtered_rows_are_not_kept(self):
        self.assertEqual(kept([row(0, 100, "x", verdict="Filler")], None), [])

    def test_score(self):
        rows = [row(1100, 1900, "hello world"), row(3050, 3450, "Đúng rồi", short=True)]
        r = score_variant(rows, ITEMS, [], 1.0, None)
        self.assertEqual(r["online_err"], 0.0)
        self.assertEqual(r["short_recall"], 1.0)
        self.assertEqual(r["phantoms"], 0)

    def test_rows_outside_the_track_are_ignored(self):
        rows = [row(1100, 1900, "hello world"), row(9000, 9500, "replay")]
        self.assertEqual([r["text"] for r in in_track(rows, ITEMS)], ["hello world"])
        self.assertEqual(len(in_track(rows, [])), 2)

    def test_offset(self):
        rng = np.random.default_rng(1)
        track = np.repeat(rng.random(300) > 0.7, 1600).astype(np.float32) * 0.5
        recording = np.concatenate([np.zeros(16000 * 2, dtype=np.float32), track])
        self.assertEqual(best_offset_ms(track, recording, 16000), 2000)
        # Track bắt đầu trước bản thu 1,5 giây.
        self.assertEqual(best_offset_ms(track, track[24000:], 16000, min_ms=-15000), -1500)


if __name__ == "__main__":
    unittest.main()
