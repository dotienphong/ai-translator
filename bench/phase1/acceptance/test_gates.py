"""Test của gates.py. Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gates import gate_a2, gate_a3, gate_a4  # noqa: E402


SESSIONS = ("en", "vi", "zh", "ja", "ko", "mixed")
MODELS = {"chuan": ("models/Hy-MT2-1.8B-Q8_0.gguf", "models/ggml-large-v3-turbo-q5_0.bin"),
          "nhe": ("models/Hy-MT2-1.8B-Q4_K_M.gguf", "models/ggml-small-q5_1.bin")}


LANGS = {"mixed": ["en", "zh", "ja", "ko"]}


def session(tier, pack, sess, p50=900, p90=1200, first=600, measured=21, lag=10, offset=40, merge="true",
            name="m1", os="macOS 26", ram="16.0", backend=None, langs=None):
    """Một file của `latency-bench latency`: nhãn, cấu hình (model, backend), máy, ngôn ngữ của các câu, và các số
    `summarize.py` cần. Backend mặc định: Metal trên Mac; Windows khuyến nghị Vulkan, tối thiểu CPU."""
    mt, asr = MODELS[pack]
    if backend is None:
        backend = "metal" if os.startswith("macOS") else "vulkan" if tier == "khuyennghi" else "cpu"
    langs = LANGS.get(sess, [sess] * 3) if langs is None else langs
    return {"label": f"{name}-{tier}-{pack}-{sess}",
            "config": {"merge": merge, "mt_model": mt, "asr_model": asr, "asr_backend": backend},
            "machine": {"os": os, "cpu": "Apple M1", "logical_cores": "8", "ram_gb": ram},
            "utterances": [{"id": i, "lang": l} for i, l in enumerate(langs)],
            "summary": {"utterances": 21, "measured": measured, "merges": 4, "feed_lag_max_ms": lag,
                        "end_offset_max_abs_ms": offset, "shown_p50_ms": p50, "shown_p90_ms": p90, "first_p50_ms": first}}


def full(tier, pack, **kw):
    return [session(tier, pack, s, **kw) for s in SESSIONS]


def failed(out):
    return {r["label"].rsplit("-", 1)[1]: r["failed"] for r in out["sessions"] if r["failed"]}


class A2(unittest.TestCase):
    def test_a_full_recommended_run_passes(self):
        out = gate_a2(full("khuyennghi", "chuan") + full("khuyennghi", "nhe"))
        self.assertTrue(out["pass"], out)
        self.assertEqual((out["tier"], out["machine"]), ("khuyennghi", "macOS 26 | Apple M1 | 16.0 GB | 8 lõi"))

    def test_recommended_machine_limits(self):
        runs = full("khuyennghi", "chuan")
        runs[0] = session("khuyennghi", "chuan", "en", p50=2001)
        runs[1] = session("khuyennghi", "chuan", "vi", p90=3001, first=1001)
        runs[2] = session("khuyennghi", "chuan", "zh", p50=2000, p90=3000, first=1000)
        out = gate_a2(runs)
        self.assertFalse(out["pass"])
        self.assertEqual(failed(out), {"en": ["shown_p50_ms"], "vi": ["shown_p90_ms", "first_p50_ms"]})

    def test_minimum_machine_only_limits_p50(self):
        self.assertTrue(gate_a2(full("toithieu", "nhe", ram="8.0", p50=3500, p90=9000, first=3000))["pass"])
        runs = full("toithieu", "nhe", ram="8.0")
        runs[3] = session("toithieu", "nhe", "ja", ram="8.0", p50=3501)
        self.assertFalse(gate_a2(runs)["pass"])

    def test_the_class_must_match_the_machine(self):
        """Nhãn chỉ để đối chiếu: Mac 24 GB mà nhãn ghi tối thiểu, hay Mac 8 GB nhãn khuyến nghị, là lỗi (Q2 của review 08
        lần 2). Windows không ghi GPU, nên chỉ kiểm RAM của hạng khuyến nghị."""
        out = gate_a2(full("toithieu", "nhe", ram="24.0"))
        self.assertFalse(out["pass"])
        self.assertIn("nhãn ghi toithieu mà máy là khuyennghi", failed(out)["en"][0])
        self.assertFalse(gate_a2(full("khuyennghi", "chuan", ram="8.0"))["pass"])
        self.assertTrue(gate_a2(full("toithieu", "nhe", os="Windows 11", ram="16.0"))["pass"])
        self.assertFalse(gate_a2(full("khuyennghi", "chuan", os="Windows 11", ram="8.0"))["pass"])

    def test_a_16_gb_windows_machine_reports_less_than_16(self):
        """Windows ghi RAM dùng được (`ullTotalPhys`), máy 16 GB thường báo 15,3–15,9 GB: vẫn là khuyến nghị (Q1 của
        review 08 lần 3)."""
        self.assertTrue(gate_a2(full("khuyennghi", "chuan", os="Windows 11", ram="15.7"))["pass"])
        low = gate_a2(full("khuyennghi", "chuan", os="Windows 11", ram="14.0"))
        self.assertFalse(low["pass"])
        self.assertIn("14 GB", failed(low)["en"][0])

    def test_on_windows_the_class_follows_the_backend(self):
        """Windows khuyến nghị có card (Vulkan), tối thiểu chạy CPU (§8): máy 32 GB chạy Vulkan mà nhãn ghi tối thiểu,
        hay máy chạy CPU mà nhãn ghi khuyến nghị, là lỗi (N2 của review 08 lần 3)."""
        big = gate_a2(full("toithieu", "nhe", os="Windows 11", ram="32.0", backend="vulkan"))
        self.assertFalse(big["pass"])
        self.assertIn("nhãn ghi toithieu mà máy là khuyennghi", failed(big)["en"][0])
        cpu = gate_a2(full("khuyennghi", "chuan", os="Windows 11", ram="32.0", backend="cpu"))
        self.assertIn("nhãn ghi khuyennghi mà máy là toithieu", failed(cpu)["en"][0])
        self.assertTrue(gate_a2(full("toithieu", "nhe", os="Windows 11", ram="32.0", backend="cpu"))["pass"])

    def test_the_session_must_match_its_sentences(self):
        """Session lấy từ nhãn phải khớp ngôn ngữ của các câu đã đo (N2 của review 08 lần 3)."""
        runs = full("khuyennghi", "chuan")
        runs[1] = session("khuyennghi", "chuan", "vi", langs=["en", "en"])
        runs[5] = session("khuyennghi", "chuan", "mixed", langs=["en", "en"])
        runs[2] = session("khuyennghi", "chuan", "zh", langs=[])
        runs[0] = session("khuyennghi", "chuan", "en", langs=["en", "ja"])
        out = gate_a2(runs)
        self.assertFalse(out["pass"])
        self.assertEqual(sorted(failed(out)), ["en", "mixed", "vi", "zh"])
        self.assertIn("câu đo là en", failed(out)["vi"][0])

    def test_each_class_needs_its_pack_and_every_session(self):
        """Máy khuyến nghị chạy gói Chuẩn, máy tối thiểu gói Nhẹ (§8), đủ 6 session (Q2 của review 08 lần 2)."""
        only_light = gate_a2(full("khuyennghi", "nhe"))
        self.assertFalse(only_light["pass"])
        self.assertEqual(only_light["missing"], [f"chuan-{s}" for s in SESSIONS])
        five = gate_a2(full("khuyennghi", "chuan")[:5])
        self.assertEqual(five["missing"], ["chuan-mixed"])
        self.assertFalse(gate_a2(full("toithieu", "chuan", ram="8.0"))["pass"])

    def test_one_machine_and_one_run_per_session(self):
        """Glob rộng ăn cả lượt cũ hay lượt biến thể: trùng session là lỗi; hai máy trong một lượt cổng là lỗi (N6)."""
        dup = gate_a2(full("khuyennghi", "chuan") + [session("khuyennghi", "chuan", "en", name="m1-cu")])
        self.assertFalse(dup["pass"])
        self.assertIn("trùng session chuan-en", failed(dup)["en"][0])
        two = gate_a2(full("khuyennghi", "chuan")[:3] + full("khuyennghi", "chuan", ram="32.0")[3:])
        self.assertFalse(two["pass"])
        self.assertEqual(two["machine"], None)

    def test_an_untrustworthy_run_cannot_pass(self):
        """Luật "lượt đo đáng tin" của bench/phase0/latency/summarize.py (Q1 của review 08 lần 1)."""
        for bad in (dict(measured=5), dict(lag=900), dict(offset=400)):
            runs = full("khuyennghi", "chuan")
            runs[0] = session("khuyennghi", "chuan", "en", **bad)
            out = gate_a2(runs)
            self.assertFalse(out["pass"], bad)
            self.assertTrue(failed(out)["en"][0].startswith(("chỉ đo được", "phát lại trễ", "mốc dừng lệch")))

    def test_nan_is_refused(self):
        """Mọi số của cổng, cả các số độ tin cậy (N1 của review 08 lần 3)."""
        for bad in (dict(p50=float("nan")), dict(lag=float("nan")), dict(measured=float("nan")),
                    dict(offset=float("inf"))):
            runs = full("khuyennghi", "chuan")
            runs[0] = session("khuyennghi", "chuan", "en", **bad)
            out = gate_a2(runs)
            self.assertFalse(out["pass"], bad)
            self.assertTrue(failed(out)["en"][0].startswith("số không hợp lệ"), bad)

    def test_a_run_without_merging_is_left_out(self):
        runs = full("khuyennghi", "chuan") + [session("khuyennghi", "chuan", "en", name="m1-nomerge", merge="false",
                                                      p50=5000)]
        out = gate_a2(runs)
        self.assertTrue(out["pass"], out)
        self.assertEqual(out["sessions"][-1]["skipped"], "lượt tắt ghép câu")

    def test_an_unknown_pack_or_no_session_fails(self):
        runs = full("khuyennghi", "chuan")
        runs[0]["config"]["mt_model"] = "models/other.gguf"
        self.assertFalse(gate_a2(runs)["pass"])
        mixed = full("khuyennghi", "chuan")
        mixed[0]["config"]["asr_model"] = MODELS["nhe"][1]
        self.assertEqual(failed(gate_a2(mixed))["en"], ["không nhận ra gói từ config.mt_model, config.asr_model"])
        partial = full("khuyennghi", "chuan")
        del partial[0]["summary"]["first_p50_ms"]
        self.assertFalse(gate_a2(partial)["pass"])
        self.assertFalse(gate_a2([])["pass"])


BASE = {"Q8_0-plain": {"en->vi": {"comet": 0.842, "n": 100}, "zh->vi": {"comet": 0.829, "n": 100}},
        "Q4_K_M-plain": {"en->vi": {"comet": 0.841, "n": 100}}}


class A3(unittest.TestCase):
    def test_within_0_01_of_the_baseline_passes(self):
        report = {"Q8_0-plain": {"en->vi": {"comet": 0.833, "n": 100}, "zh->vi": {"comet": 0.820, "n": 100}},
                  "Q4_K_M-plain": {"en->vi": {"comet": 0.832, "n": 100}}}
        out = gate_a3(report, BASE)
        self.assertTrue(out["pass"], out)

    def test_more_than_0_01_below_regresses(self):
        report = {"Q8_0-plain": {"en->vi": {"comet": 0.842}, "zh->vi": {"comet": 0.818}}}
        self.assertTrue(gate_a3(report, BASE)["regressed"])
        self.assertFalse(gate_a3(report, BASE)["pass"])

    def test_the_english_floor_applies_per_pack(self):
        base = {"Q8_0-plain": {"en->vi": {"comet": 0.835}}, "Q4_K_M-plain": {"en->vi": {"comet": 0.805}}}
        report = {"Q8_0-plain": {"en->vi": {"comet": 0.829}}, "Q4_K_M-plain": {"en->vi": {"comet": 0.799}}}
        out = gate_a3(report, base)
        self.assertEqual(out["below_floor"], ["Q8_0-plain en->vi 0.829 < 0.83", "Q4_K_M-plain en->vi 0.799 < 0.80"])
        self.assertFalse(out["regressed"])
        self.assertFalse(out["pass"])

    def test_the_floor_does_not_apply_to_runs_with_context(self):
        base = {"Q8_0-context": {"en->vi": {"comet": 0.671}}}
        self.assertTrue(gate_a3({"Q8_0-context": {"en->vi": {"comet": 0.671}}}, base)["pass"])

    def test_every_sentence_must_be_scored(self):
        """Lượt chỉ chấm 3 câu không so được với mốc 100 câu (N2 của review 08 lần 2)."""
        report = {"Q8_0-plain": {"en->vi": {"comet": 0.85, "n": 3}, "zh->vi": {"comet": 0.83, "n": 100}},
                  "Q4_K_M-plain": {"en->vi": {"comet": 0.84, "n": 100}}}
        out = gate_a3(report, BASE)
        self.assertEqual(out["missing"], ["Q8_0-plain en->vi: chỉ chấm 3/100 câu"])
        self.assertFalse(out["pass"])

    def test_a_missing_pack_fails(self):
        """Lượt của mốc mà lượt này không chạy (một gói) là thiếu (Q2 của review 08 lần 1)."""
        out = gate_a3({"Q4_K_M-plain": {"en->vi": {"comet": 0.841}}}, BASE)
        self.assertEqual(out["missing"], ["thiếu lượt Q8_0-plain"])
        self.assertFalse(out["pass"])

    def test_a_missing_direction_fails(self):
        out = gate_a3({"Q8_0-plain": {"en->vi": {"comet": 0.85}}}, BASE)
        self.assertEqual(out["missing"], ["Q8_0-plain: thiếu chiều zh->vi", "thiếu lượt Q4_K_M-plain"])
        self.assertFalse(out["pass"])


TURBO = {"en": {"wer": 0.054}, "vi": {"wer": 0.087}, "zh": {"cer": 0.056}}
SMALL = {"en": {"wer": 0.066}, "vi": {"wer": 0.225}, "zh": {"cer": 0.096}}


class A4(unittest.TestCase):
    def test_the_pack_comes_from_the_numbers(self):
        """Gói suy từ số đo (gần mốc nào hơn), không từ cờ hay tên file (Q1 của review 08 lần 2)."""
        out = gate_a4({"en": {"wer": 0.0594}, "vi": {"wer": 0.09}, "zh": {"cer": 0.0616}}, TURBO, SMALL)
        self.assertEqual(out["pack"], "turbo")
        self.assertTrue(out["pass"], out)
        out = gate_a4({"en": {"wer": 0.07}, "vi": {"wer": 0.23}, "zh": {"cer": 0.1}}, TURBO, SMALL)
        self.assertEqual(out["pack"], "small")
        self.assertTrue(out["pass"], out)

    def test_more_than_10_percent_worse_fails(self):
        out = gate_a4({"en": {"wer": 0.0595}, "vi": {"wer": 0.08}, "zh": {"cer": 0.05}}, TURBO, SMALL)
        self.assertEqual([r["pass"] for r in out["groups"]], [False, True, True])
        self.assertFalse(out["pass"])

    def test_cer_is_used_where_the_baseline_has_cer(self):
        out = gate_a4({"en": {"wer": 0.05}, "vi": {"wer": 0.08}, "zh": {"wer": 0.01, "cer": 0.07}}, TURBO, SMALL)
        self.assertEqual(out["groups"][2]["metric"], "cer")
        self.assertFalse(out["pass"])

    def test_a_missing_group_fails(self):
        out = gate_a4({"en": {"wer": 0.05}, "zh": {"cer": 0.05}}, TURBO, SMALL)
        self.assertEqual(out["missing"], ["vi"])
        self.assertFalse(out["pass"])


if __name__ == "__main__":
    unittest.main()
