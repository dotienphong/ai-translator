"""Test của soak.py. Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
"""
import contextlib
import io
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import soak  # noqa: E402
from soak import origin, parse_cputime, parse_powershell, parse_ps, read_csv, sample, select, summarize  # noqa: E402

NAMES = ("meeting-translator", "asr-worker", "llama-server")
REQUIRE = ("meeting-translator", "asr-worker", "llama-server")

PS = """    1     0  13264   0:12.34 /sbin/launchd
  812     1 120000   1:02.50 /Applications/AI Translator.app/Contents/MacOS/meeting-translator
  830   812 650000   2:03:04.00 /Applications/AI Translator.app/Contents/MacOS/asr-worker
  831   812 2100000 1-00:00:01 /Applications/AI Translator.app/Contents/MacOS/llama-server
  840     1 300000   0:30.00 /System/Library/Frameworks/WebKit.framework/Versions/A/XPCServices/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent
  850     1 600000   0:40.00 /System/Library/Frameworks/WebKit.framework/Versions/A/XPCServices/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent
  900     1   2000   0:00.01 /bin/zsh
"""

WIN = ('[{"ProcessId":4,"ParentProcessId":0,"Name":"System","WorkingSetSize":1024,"KernelModeTime":0,"UserModeTime":0},'
       '{"ProcessId":70,"ParentProcessId":4,"Name":"meeting-translator.exe","WorkingSetSize":"104857600",'
       '"KernelModeTime":20000000,"UserModeTime":30000000},'
       '{"ProcessId":77,"ParentProcessId":70,"Name":"asr-worker-vulkan.exe","WorkingSetSize":2097152,'
       '"KernelModeTime":0,"UserModeTime":122500000},'
       '{"ProcessId":80,"ParentProcessId":70,"Name":"msedgewebview2.exe","WorkingSetSize":4194304,'
       '"KernelModeTime":10000000,"UserModeTime":0},'
       '{"ProcessId":81,"ParentProcessId":80,"Name":"msedgewebview2.exe","WorkingSetSize":1048576,'
       '"KernelModeTime":0,"UserModeTime":0},'
       '{"ProcessId":90,"ParentProcessId":4,"Name":"msedgewebview2.exe","WorkingSetSize":9999999,'
       '"KernelModeTime":0,"UserModeTime":0}]')


class Parse(unittest.TestCase):
    def test_cputime_formats(self):
        self.assertEqual(parse_cputime("0:12.34"), 12.34)
        self.assertEqual(parse_cputime("2:03:04.00"), 7384.0)
        self.assertEqual(parse_cputime("1-00:00:01"), 86401.0)

    def test_ps_keeps_the_app_its_sidecars_and_its_own_webkit(self):
        """WebKit của app khác (pid 850, Safari) không tính: gán theo tiến trình chịu trách nhiệm (N1 của review 08 lần 2)."""
        responsible = {840: 812, 850: 700}.get
        rows = select(parse_ps(PS), NAMES, "meeting-translator", responsible)
        self.assertEqual([r[:2] for r in rows], [(812, "meeting-translator"), (830, "asr-worker"),
                                                  (831, "llama-server"), (840, "com.apple.WebKit.WebContent")])
        self.assertEqual(rows[2][2], 2100000)
        self.assertEqual(rows[0][3], 62.5)
        self.assertEqual(len(select(parse_ps(PS), NAMES, "meeting-translator")), 3, "không có hàm thì không tính WebKit")

    def test_windows_keeps_every_descendant_of_the_app(self):
        """WebView2 (`msedgewebview2`) là con của app; WebView2 của app khác (pid 90) không tính (Q3 của review 08 lần 1)."""
        rows = select(parse_powershell(WIN), REQUIRE, "meeting-translator")
        self.assertEqual(rows, [(70, "meeting-translator", 102400, 5.0), (77, "asr-worker-vulkan", 2048, 12.25),
                                (80, "msedgewebview2", 4096, 1.0), (81, "msedgewebview2", 1024, 0.0)])
        one = '{"ProcessId":5,"ParentProcessId":1,"Name":"meeting-translator.exe","WorkingSetSize":1024,"UserModeTime":0}'
        self.assertEqual(select(parse_powershell(one), REQUIRE, "meeting-translator"),
                         [(5, "meeting-translator", 1, 0.0)])


def run(hours, ram=lambda t: 1000 * 1024, cpu_rate=0.5, every=60, restart_at=None, vanish_at=None):
    """Mẫu giả: ba tiến trình, mỗi `every` giây; tổng RAM theo hàm `ram(t)` (KiB), CPU `cpu_rate` giây mỗi giây."""
    rows = []
    for k in range(int(hours * 3600 / every) + 1):
        t = k * every
        for i, name in enumerate(REQUIRE):
            if vanish_at is not None and name == "llama-server" and t >= vanish_at:
                continue
            pid = 100 + i + (1000 if restart_at is not None and name == "asr-worker" and t >= restart_at else 0)
            rows.append((float(t), pid, name, ram(t) // 3, cpu_rate * t / 3))
    return rows


class Summarize(unittest.TestCase):
    def test_a_steady_two_hour_run_passes(self):
        out = summarize(run(2), ncpu=10)
        self.assertTrue(out["pass_a5"], out)
        self.assertAlmostEqual(out["ram_growth"], 0.0, places=3)
        self.assertAlmostEqual(out["cpu_avg"], 0.05, places=3)
        self.assertTrue(out["pass_cpu"])

    def test_ram_growth_over_10_percent_after_the_first_hour_fails(self):
        grow = summarize(run(2, ram=lambda t: 1000 * 1024 if t <= 3600 else 1101 * 1024), ncpu=10)
        self.assertFalse(grow["pass_a5"])
        self.assertAlmostEqual(grow["ram_growth"], 0.101, places=3)
        ok = summarize(run(2, ram=lambda t: 1000 * 1024 if t <= 3600 else 1099 * 1024), ncpu=10)
        self.assertTrue(ok["pass_a5"])

    def test_growth_inside_the_first_hour_does_not_count(self):
        out = summarize(run(2, ram=lambda t: 500 * 1024 if t < 3300 else 1000 * 1024), ncpu=10)
        self.assertTrue(out["pass_a5"], out)

    def test_too_short_fails(self):
        out = summarize(run(1.5), ncpu=10)
        self.assertFalse(out["long_enough"])
        self.assertFalse(out["pass_a5"])

    def test_a_restart_or_a_vanished_process_fails(self):
        restarted = summarize(run(2, restart_at=4000), ncpu=10)
        self.assertEqual(restarted["restarts"], {"asr-worker": 1})
        self.assertFalse(restarted["pass_a5"])
        vanished = summarize(run(2, vanish_at=5000), ncpu=10)
        self.assertEqual(vanished["missing"], ["llama-server"])
        self.assertFalse(vanished["pass_a5"])

    def test_cpu_over_30_percent_of_the_machine_fails(self):
        out = summarize(run(2, cpu_rate=3.1), ncpu=10)
        self.assertAlmostEqual(out["cpu_avg"], 0.31, places=3)
        self.assertFalse(out["pass_cpu"])
        self.assertTrue(out["pass_a5"])

    def test_the_summary_says_where_it_was_measured(self):
        """Hệ điều hành và mã máy ghi lúc lấy mẫu, không theo tên file (Q1 của review 08 lần 2)."""
        out = summarize(run(2), ncpu=10, where=[{"os": "win", "host": "abc123"}])
        self.assertEqual((out["os"], out["host"]), ("win", "abc123"))
        self.assertTrue(out["pass_a5"])
        mixed = summarize(run(2), ncpu=10, where=[{"os": "win", "host": "a"}, {"os": "mac", "host": "b"}])
        self.assertEqual(mixed["os"], None)
        self.assertFalse(mixed["pass_a5"])

    def test_origin_names_the_platform_without_the_host_name(self):
        o = origin()
        self.assertIn(o["os"], ("mac", "win", "linux"))
        self.assertRegex(o["host"], "^[0-9a-f]{12}$")

    def test_no_samples(self):
        self.assertFalse(summarize([], ncpu=10)["pass_a5"])

    def test_a_required_process_absent_from_the_start_fails(self):
        """Gõ sai tên app ở `--names`, hay app không chạy: không đạt (Q3 của review 08 lần 1)."""
        rows = [r for r in run(2) if r[2] != "meeting-translator"]
        out = summarize(rows, ncpu=10, require=REQUIRE)
        self.assertEqual(out["absent"], ["meeting-translator"])
        self.assertFalse(out["pass_a5"])
        self.assertFalse(out["pass_cpu"])

    def test_two_webviews_at_once_are_not_a_restart(self):
        rows = run(2)
        rows += [(t, 500 + k, "com.apple.WebKit.WebContent", 1000, 0.0) for t in sorted({r[0] for r in rows})
                 for k in (0, 1)]
        out = summarize(rows, ncpu=10)
        self.assertEqual(out["restarts"], {})
        self.assertTrue(out["pass_a5"], out)


class Sample(unittest.TestCase):
    def test_writes_one_row_per_process_per_tick(self):
        now = [0.0]

        def clock():
            return now[0]

        def sleep(s):
            now[0] += s

        snap = lambda names, app: [(1, "meeting-translator", 1000, now[0] / 10), (2, "llama-server", 2000, 0.0)]  # noqa
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "s.csv")
            self.assertEqual(sample(NAMES, 10, 30, path, snap=snap, clock=clock, sleep=sleep), 4)
            rows, where = read_csv(path)
        self.assertEqual(where, [origin()])
        self.assertEqual(len(rows), 8)
        self.assertEqual(sorted({r[0] for r in rows}), [0.0, 10.0, 20.0, 30.0])
        self.assertEqual(rows[-2], (30.0, 1, "meeting-translator", 1000, 3.0))


class Pids(unittest.TestCase):
    def test_lists_the_processes_of_the_app_for_the_network_check(self):
        """`pids` in pid và tên các tiến trình của app (cả WebView) cho bước bù của A7 (N7 của review 08 lần 2)."""
        snap = mock.Mock(return_value=[(812, "meeting-translator", 1, 0.0), (845, "com.apple.WebKit.Networking", 1, 0.0)])
        out = io.StringIO()
        with mock.patch.object(soak, "snapshot", snap), contextlib.redirect_stdout(out):
            self.assertEqual(soak.main(["pids", "--app", "meeting-translator"]), 0)
        self.assertEqual(out.getvalue(), "812 meeting-translator\n845 com.apple.WebKit.Networking\n")
        snap.assert_called_once_with(NAMES, "meeting-translator")


if __name__ == "__main__":
    unittest.main()
