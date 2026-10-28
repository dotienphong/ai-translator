"""Test `build_cv_vi.py` bằng clip tổng hợp (không cần dữ liệu Common Voice thật).

cd bench/2026-10-26-nguoi-noi && python -B -m unittest test_build_cv_vi
"""
import os
import random
import shutil
import subprocess
import sys
import tempfile
import unittest

import numpy as np
import soundfile as sf

import build_cv_vi as b

SR = b.SR


def have_ffmpeg_opus():
    if shutil.which("ffmpeg") is None:
        return False
    out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    return "libopus" in out


def read_rttm(path):
    turns = []
    with open(path) as f:
        for line in f:
            p = line.split()
            assert p[0] == "SPEAKER" and len(p) == 10, line
            turns.append((float(p[3]), float(p[4]), p[7]))
    return turns


def noise_loader(dur=3.0):
    """Mỗi clip là tiếng ồn dài `dur` giây (không phụ thuộc đường dẫn)."""
    rs = np.random.RandomState(0)
    return lambda path: (rs.randn(int(dur * SR)) * 0.05).astype(np.float32)


def bit_loader(dur=3.0):
    """Đường dẫn "<i>/<k>": clip hằng số 2^i/64, nên tổng các giọng chồng nhau đọc ngược ra tập giọng đang nói (chính xác trong float32)."""
    return lambda path: np.full(int(dur * SR), 2.0 ** int(path.split("/")[0]) / 64.0, dtype=np.float32)


def make_pool(n_speakers, clips_each=30):
    return {f"{i}": [f"{i}/{k}" for k in range(clips_each)] for i in range(n_speakers)}


def active_bits(mix, t):
    v = int(round(float(mix[int(round(t * SR))]) * 64))
    return {i for i in range(4) if v >> i & 1}


class TrimNormalize(unittest.TestCase):
    def test_rms_va_cat_im_lang(self):
        x = np.concatenate([np.zeros(SR), 0.3 * np.sin(2 * np.pi * 220 * np.arange(SR) / SR), np.zeros(2 * SR)])
        y = b.trim_normalize(x)
        rms_db = 20 * np.log10(np.sqrt(np.mean(y ** 2)))
        self.assertEqual(y.dtype, np.float32)
        # RMS tính trên cả đoạn (đã gồm 0,1 s im lặng mỗi đầu) nên đúng −26 dBFS
        self.assertAlmostEqual(rms_db, b.TARGET_DBFS, places=2)
        # còn lại ~1 s tiếng + 2 × 0,1 s chừa, không còn 3 s im lặng
        self.assertAlmostEqual(len(y) / SR, 1.2, delta=0.01)

    def test_im_lang_hoan_toan_khong_loi(self):
        y = b.trim_normalize(np.zeros(1000))
        self.assertEqual(len(y), 1000)
        self.assertTrue(np.all(y == 0))

    def test_rong(self):
        self.assertEqual(len(b.trim_normalize(np.zeros(0))), 0)


class Speakers(unittest.TestCase):
    def test_loc_theo_file_co_that_va_so_cau(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "clips"))
            rows = ["client_id\tpath\tsentence"]
            for spk, n_listed, n_exist in [("a", 20, 20), ("b", 20, 10), ("c", 5, 5)]:
                for k in range(n_listed):
                    name = f"{spk}{k}.mp3"
                    rows.append(f'{spk}\t{name}\tcâu "{k}" có dấu nháy')
                    if k < n_exist:
                        open(os.path.join(d, "clips", name), "wb").close()
            with open(os.path.join(d, "validated.tsv"), "w", encoding="utf-8") as f:
                f.write("\n".join(rows) + "\n")
            got = b.speakers(d, 15)
            self.assertEqual(sorted(got), ["a"])  # b chỉ có 10 file thật, c chỉ 5 câu
            self.assertEqual(len(got["a"]), 20)
            self.assertTrue(all(os.path.isfile(p) for p in got["a"]))
            self.assertEqual(sorted(b.speakers(d, 5)), ["a", "b", "c"])


class Build(unittest.TestCase):
    def run_build(self, seed=0, pool_size=8, seconds=300.0, loader=None):
        pool_map = make_pool(pool_size)
        rng = random.Random(seed)
        return b.build(rng, sorted(pool_map), pool_map, seconds, loader or noise_loader())

    def test_so_nguoi_do_dai_va_nhan(self):
        for seed in range(5):
            mix, turns, _ = self.run_build(seed)
            labels = {t[2] for t in turns}
            self.assertIn(len(labels), (3, 4))
            self.assertEqual(labels, {f"S{i + 1}" for i in range(len(labels))})
            end = max(s + d for s, d, _ in turns)
            self.assertGreaterEqual(end, 300.0)  # lượt cuối bắt đầu trước 300 s và dài > 0
            self.assertAlmostEqual(len(mix) / SR, end + 1.0, delta=0.01)
            self.assertTrue(all(s >= 0 and d > 0 for s, d, _ in turns))
            self.assertLessEqual(float(np.max(np.abs(mix))), 0.99 + 1e-6)

    def test_tat_dinh_theo_seed(self):
        a = self.run_build(7)
        c = self.run_build(7)
        d = self.run_build(8)
        self.assertEqual(a[1], c[1])
        self.assertTrue(np.array_equal(a[0], c[0]))
        self.assertNotEqual(a[1], d[1])

    def test_luat_luot(self):
        """Tỉ lệ nói tiếp ~15%, chen lời ~10% (khi đổi người), nghỉ 0,15–1,2 s, chen sớm 0,3–1,0 s, người không tự chồng mình."""
        _, turns, _ = self.run_build(1, pool_size=10, seconds=40_000.0)
        same = overlap = changes = 0
        for (s0, d0, l0), (s1, d1, l1) in zip(turns, turns[1:]):
            gap = s1 - (s0 + d0)
            if l1 == l0:
                same += 1
                self.assertGreaterEqual(gap, 0.15 - 1e-9)
                self.assertLessEqual(gap, 1.2 + 1e-9)
            else:
                changes += 1
                if gap < 0:
                    overlap += 1
                    self.assertGreaterEqual(-gap, 0.3 - 1e-9)
                    self.assertLessEqual(-gap, 1.0 + 1e-9)
                else:
                    self.assertGreaterEqual(gap, 0.15 - 1e-9)
                    self.assertLessEqual(gap, 1.2 + 1e-9)
        n = len(turns) - 1
        self.assertGreater(n, 5000)
        self.assertAlmostEqual(same / n, 0.15, delta=0.02)
        self.assertAlmostEqual(overlap / changes, 0.10, delta=0.02)

    def test_am_thanh_khop_rttm(self):
        """Tập giọng đang nói trong âm thanh luôn nằm trong tập nhãn RTTM tại thời điểm đó, và đầu/cuối mỗi lượt đều có tiếng
        của đúng người của lượt (nhãn S<k> ứng đúng một giọng)."""
        # 4 người, bit i ứng với người i; mỗi lượt 1–2 clip hằng số 3 s
        mix, turns, _ = self.run_build(2, pool_size=4, loader=bit_loader(3.0))
        labels = sorted({t[2] for t in turns})
        candidates = {lab: {0, 1, 2, 3} for lab in labels}
        for s, d, lab in turns:
            candidates[lab] &= active_bits(mix, s + 0.01)
            candidates[lab] &= active_bits(mix, s + d - 0.01)
        for lab, bits in candidates.items():
            self.assertEqual(len(bits), 1, (lab, bits))  # nhãn ứng đúng một giọng
        who = {lab: next(iter(bits)) for lab, bits in candidates.items()}
        self.assertEqual(len(set(who.values())), len(labels))  # hai nhãn không chung giọng
        # mọi lúc, mọi giọng đang có tiếng đều đang có lượt RTTM của giọng đó
        end = max(s + d for s, d, _ in turns)
        t = 0.0
        while t < end:
            covering = {who[lab] for s, d, lab in turns if s - 0.001 <= t < s + d + 0.001}  # dung sai làm tròn mẫu
            self.assertTrue(active_bits(mix, t) <= covering, (t, active_bits(mix, t), covering))
            t += 0.05

    def test_cau_dung_lai_duoc_dem(self):
        # mỗi người 30 câu 3 s: ~80 s mỗi người trong 300 s, dùng lại khi hết 30 câu
        pool_map = make_pool(8, clips_each=3)
        _, turns, reused = b.build(random.Random(0), sorted(pool_map), pool_map, 300.0, noise_loader())
        self.assertGreater(reused, 0)
        pool_map = make_pool(8, clips_each=500)
        _, turns, reused = b.build(random.Random(0), sorted(pool_map), pool_map, 300.0, noise_loader())
        self.assertEqual(reused, 0)


class WriteAndOpus(unittest.TestCase):
    def test_write_rttm_va_wav(self):
        with tempfile.TemporaryDirectory() as d:
            mix = (np.random.RandomState(0).randn(SR * 3) * 0.05).astype(np.float32)
            turns = [(0.5, 1.25, "S1"), (1.0, 1.9, "S2")]
            b.write(d, "x", mix, turns)
            self.assertEqual(read_rttm(os.path.join(d, "x.rttm")), turns)
            with open(os.path.join(d, "x.rttm")) as f:
                self.assertEqual(f.readline().strip(), "SPEAKER x 1 0.500 1.250 <NA> <NA> S1 <NA> <NA>")
            data, sr = sf.read(os.path.join(d, "x.wav"), dtype="int16")
            info = sf.info(os.path.join(d, "x.wav"))
            self.assertEqual((sr, data.ndim, info.subtype, len(data)), (SR, 1, "PCM_16", SR * 3))

    @unittest.skipUnless(have_ffmpeg_opus(), "cần ffmpeg có libopus")
    def test_opus_cung_do_dai_va_rttm(self):
        with tempfile.TemporaryDirectory() as d:
            t = np.arange(SR * 4) / SR
            mix = (0.1 * np.sin(2 * np.pi * 300 * t) * (1 + np.sin(2 * np.pi * 3 * t))).astype(np.float32)
            b.write(d, "x", mix, [(0.0, 4.0, "S1")])
            b.opus(d, "x")
            data, sr = sf.read(os.path.join(d, "x-opus.wav"), dtype="int16")
            info = sf.info(os.path.join(d, "x-opus.wav"))
            self.assertEqual((sr, data.ndim, info.subtype), (SR, 1, "PCM_16"))
            self.assertAlmostEqual(len(data) / SR, 4.0, delta=0.1)
            self.assertEqual(read_rttm(os.path.join(d, "x-opus.rttm")), read_rttm(os.path.join(d, "x.rttm")))
            self.assertGreater(float(np.sqrt(np.mean(data.astype(np.float64) ** 2))), 500)  # không ra toàn im lặng


@unittest.skipUnless(have_ffmpeg_opus(), "cần ffmpeg có libopus")
class EndToEnd(unittest.TestCase):
    def test_main_voi_clip_tong_hop(self):
        """Chạy `main` qua dòng lệnh trên 10 người × 16 clip tổng hợp: ra đủ 4 file mỗi hội thoại, nhãn khớp wav."""
        with tempfile.TemporaryDirectory() as d:
            cv, out = os.path.join(d, "cv"), os.path.join(d, "out")
            os.makedirs(os.path.join(cv, "clips"))
            rs = np.random.RandomState(1)
            rows = ["client_id\tpath"]
            for spk in range(10):
                f0 = 120 + 25 * spk
                for k in range(16):
                    n = int(rs.uniform(1.5, 3.0) * SR)
                    t = np.arange(n) / SR
                    x = 0.2 * np.sin(2 * np.pi * f0 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 4 * t))
                    name = f"s{spk}_{k}.wav"
                    sf.write(os.path.join(cv, "clips", name), x.astype(np.float32), SR)
                    rows.append(f"spk{spk}\t{name}")
            with open(os.path.join(cv, "validated.tsv"), "w") as f:
                f.write("\n".join(rows) + "\n")
            here = os.path.dirname(os.path.abspath(__file__))
            r = subprocess.run(
                [sys.executable, "-B", "-I", os.path.join(here, "build_cv_vi.py"), cv, out, "--n", "2", "--seed", "0",
                 "--seconds", "30"],
                capture_output=True, text=True,
            )
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("10 người có ≥ 15 câu", r.stdout)
            for n in ("cv-vi-01", "cv-vi-02"):
                for suffix in (".wav", ".rttm", "-opus.wav", "-opus.rttm"):
                    self.assertTrue(os.path.isfile(os.path.join(out, n + suffix)), n + suffix)
                turns = read_rttm(os.path.join(out, n + ".rttm"))
                info = sf.info(os.path.join(out, n + ".wav"))
                self.assertAlmostEqual(info.duration, max(s + d for s, d, _ in turns) + 1.0, delta=0.01)
                self.assertGreaterEqual(len({t[2] for t in turns}), 3)

    def test_it_nguoi_thi_dung(self):
        with tempfile.TemporaryDirectory() as d:
            cv, out = os.path.join(d, "cv"), os.path.join(d, "out")
            os.makedirs(os.path.join(cv, "clips"))
            rows = ["client_id\tpath"]
            for spk in range(3):
                for k in range(20):
                    sf.write(os.path.join(cv, "clips", f"s{spk}_{k}.wav"), np.zeros(SR, dtype=np.float32), SR)
                    rows.append(f"spk{spk}\ts{spk}_{k}.wav")
            with open(os.path.join(cv, "validated.tsv"), "w") as f:
                f.write("\n".join(rows) + "\n")
            here = os.path.dirname(os.path.abspath(__file__))
            r = subprocess.run([sys.executable, "-B", "-I", os.path.join(here, "build_cv_vi.py"), cv, out],
                               capture_output=True, text=True)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn("≥ 8 người", r.stderr)


if __name__ == "__main__":
    unittest.main()
