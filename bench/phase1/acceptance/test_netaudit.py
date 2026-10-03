"""Test của netaudit.py. Chạy từ gốc repo:
  python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from netaudit import audit, main, sessions_from_log, when  # noqa: E402
from soak import origin  # noqa: E402

ALLOW = {
    "hosts": {
        "license.example": [
            {"path": "/v1/licenses/validate", "during_session": True},
            {"path": "/v1/plans", "during_session": True},
            {"path": "/v1/checkout", "during_session": False},
        ],
        "models.example": [{"path": "/manifest/", "during_session": True}],
    },
    "max_body_bytes": 256,
    "canaries": ["plotting analysis", "Kết quả phân tích"],
}
START, STOP = when("2026-10-03T10:00:00+07:00"), when("2026-10-03T11:00:00+07:00")
LOG = ("[2026-10-03][09:49:58][INFO][meeting_translator_lib] khởi động AI Translator 0.1.0, lúc đăng nhập: false\n"
       "[2026-10-03][10:00:02][INFO][meeting_translator_lib::session] bắt đầu phiên dịch 1\n"
       "[2026-10-03][10:59:58][INFO][pipeline::engine] phiên dịch kết thúc: 12 đoạn\n"
       "[2026-10-03][10:59:58][INFO][meeting_translator_lib::session] kết thúc phiên dịch: 12 đoạn (lọc 0, bỏ 0)\n")


def entry(url, at="2026-10-03T10:30:00+07:00", method="GET", body=None, mime="application/json"):
    req = {"method": method, "url": url, "bodySize": -1 if body is None else len(body.encode())}
    if body is not None:
        req["postData"] = {"mimeType": mime, "text": body}
    return {"startedDateTime": at, "request": req}


def har(*entries):
    """Nhật ký có một request trước và một request sau phiên (bước "Kiểm tra ngay" của 08b), để cửa sổ phiên nằm trong."""
    edges = [entry("https://license.example/v1/licenses/validate", at="2026-10-03T09:50:00+07:00"),
             entry("https://license.example/v1/licenses/validate", at="2026-10-03T11:10:00+07:00")]
    return {"log": {"entries": [edges[0], *entries, edges[1]]}}


class Audit(unittest.TestCase):
    def test_scheduled_requests_during_the_session_pass(self):
        out = audit(har(entry("https://license.example/v1/licenses/validate", method="POST",
                              body='{"key":"X","activation_id":"a"}'),
                        entry("https://models.example/manifest/models.json"),
                        entry("http://127.0.0.1:8080/completion", body="x" * 5000)), ALLOW, START, STOP)
        self.assertTrue(out["pass"], out)
        self.assertEqual((out["external"], out["in_session"]), (4, 2))

    def test_unknown_host_or_path_fails(self):
        out = audit(har(entry("https://tracker.example/collect"),
                        entry("https://license.example/v1/admin/x")), ALLOW, START, STOP)
        self.assertEqual([v["reason"] for v in out["violations"]],
                         ["máy chủ không có trong danh sách cho phép", "đường dẫn không có trong danh sách cho phép"])

    def test_unscheduled_request_only_fails_during_the_session(self):
        before = entry("https://license.example/v1/checkout", at="2026-10-03T09:59:59+07:00", method="POST", body="{}")
        during = entry("https://license.example/v1/checkout", method="POST", body="{}")
        self.assertTrue(audit(har(before), ALLOW, START, STOP)["pass"])
        out = audit(har(during), ALLOW, START, STOP)
        self.assertEqual([v["reason"] for v in out["violations"]],
                         ["gọi trong lúc dịch mà không phải việc chạy theo lịch"])

    def test_large_or_audio_bodies_fail(self):
        big = entry("https://license.example/v1/plans", method="POST", body="a" * 257)
        audio = entry("https://license.example/v1/plans", method="POST", body="RIFF", mime="audio/wav")
        out = audit(har(big, audio), ALLOW, START, STOP)
        self.assertEqual([v["reason"] for v in out["violations"]], ["thân request 257 byte, quá 256", "kiểu audio/wav"])

    def test_a_canary_in_the_body_or_the_url_fails(self):
        body = entry("https://license.example/v1/plans", method="POST", body='{"t":"the PLOTTING analysis"}')
        url = entry("https://license.example/v1/plans?q=k%E1%BA%BFt%20qu%E1%BA%A3%20ph%C3%A2n%20t%C3%ADch")
        out = audit(har(body, url), ALLOW, START, STOP)
        self.assertEqual([v["reason"] for v in out["violations"]],
                         ["có từ mồi 'plotting analysis'", "có từ mồi 'kết quả phân tích'"])

    def test_no_external_request_means_the_proxy_saw_nothing(self):
        out = audit({"log": {"entries": [entry("http://localhost:9000/health")]}}, ALLOW, START, STOP)
        self.assertFalse(out["pass"])
        self.assertIn("không có request ra ngoài nào: kiểm lại proxy", [v["reason"] for v in out["violations"]])

    def test_the_session_window_is_required(self):
        """Thiếu mốc Bắt đầu, Dừng thì luật "trong lúc dịch" không chạy được: không đạt (N2 của review 08 lần 1)."""
        out = audit(har(entry("https://license.example/v1/plans")), ALLOW)
        self.assertEqual([v["reason"] for v in out["violations"]], ["thiếu mốc Bắt đầu, Dừng của phiên dịch"])
        self.assertFalse(out["pass"])

    def test_the_window_must_be_ordered_and_inside_the_log(self):
        """Mốc đảo, hay ghi sai múi giờ (cửa sổ lệch khỏi nhật ký): lỗi, không phải đạt (Q3 của review 08 lần 2)."""
        during = entry("https://license.example/v1/licenses/activate", method="POST", body="{}")
        flipped = audit(har(during), ALLOW, STOP, START)
        self.assertIn("mốc Dừng không sau mốc Bắt đầu", [v["reason"] for v in flipped["violations"]])
        utc = audit(har(during), ALLOW, when("2026-10-03T10:00:00+00:00"), when("2026-10-03T11:00:00+00:00"))
        self.assertIn("cửa sổ phiên dịch không nằm trong khoảng thời gian của nhật ký (sai múi giờ?)",
                      [v["reason"] for v in utc["violations"]])
        self.assertFalse(flipped["pass"] or utc["pass"])

    def test_the_app_log_widens_a_window_noted_too_short(self):
        """Người ghi Dừng sớm: phiên trong log của app (10:00:02–10:59:58) vẫn được kiểm đủ (N3 của review 08 lần 3)."""
        late = entry("https://license.example/v1/checkout", at="2026-10-03T10:30:00+07:00", method="POST", body="{}")
        sessions = sessions_from_log(LOG, START.tzinfo)
        self.assertEqual(sessions, [(when("2026-10-03T10:00:02+07:00"), when("2026-10-03T10:59:58+07:00"))])
        early_stop = when("2026-10-03T10:10:00+07:00")
        self.assertTrue(audit(har(late), ALLOW, START, early_stop)["pass"], "không có log: phần sau 10:10 không kiểm")
        out = audit(har(late), ALLOW, START, early_stop, sessions)
        self.assertEqual([v["reason"] for v in out["violations"]],
                         ["gọi trong lúc dịch mà không phải việc chạy theo lịch"])
        self.assertEqual(out["window"], ["2026-10-03T10:00:00+07:00", "2026-10-03T10:59:58+07:00"])

    def test_the_app_log_must_have_the_session(self):
        none = audit(har(), ALLOW, START, STOP, sessions_from_log(LOG.replace("2026-10-03", "2026-10-02"), START.tzinfo))
        self.assertIn("log của app không có phiên dịch nào trùng mốc Bắt đầu, Dừng", [v["reason"] for v in none["violations"]])
        unfinished = sessions_from_log(LOG.splitlines()[1], START.tzinfo)
        self.assertEqual(unfinished, [(when("2026-10-03T10:00:02+07:00"), None)])
        out = audit(har(), ALLOW, START, STOP, unfinished)
        self.assertIn("phiên dịch trong log của app chưa có dòng kết thúc (app thoát giữa phiên?)",
                      [v["reason"] for v in out["violations"]])
        self.assertFalse(none["pass"] or out["pass"])
        crashed_before = "[2026-10-02][16:00:00][INFO][meeting_translator_lib::session] bắt đầu phiên dịch 1\n" + LOG
        self.assertEqual(sessions_from_log(crashed_before, START.tzinfo), sessions_from_log(LOG, START.tzinfo),
                         "phiên cũ không có dòng kết thúc (app bị tắt) không làm hỏng phiên sau")

    def test_encoded_canaries_are_found(self):
        """Từ mồi trong query có dấu +, thân form, JSON có \\u (N4 của review 08 lần 2)."""
        allow = dict(ALLOW, hosts={"license.example": [{"path": "/v1/", "during_session": True}]})
        query = entry("https://license.example/v1/plans?q=plotting+analysis")
        form = entry("https://license.example/v1/plans", method="POST", body="t=plotting+analysis&x=1",
                     mime="application/x-www-form-urlencoded")
        escaped = entry("https://license.example/v1/plans", method="POST",
                        body='{"t": "K\\u1ebft qu\\u1ea3 ph\\u00e2n t\\u00edch"}')
        out = audit(har(query, form, escaped), allow, START, STOP)
        self.assertEqual([v["reason"] for v in out["violations"]],
                         ["có từ mồi 'plotting analysis'", "có từ mồi 'plotting analysis'",
                          "có từ mồi 'kết quả phân tích'"])

    def test_the_longest_matching_rule_wins(self):
        allow = {"hosts": {"license.example": [{"path": "/v1/", "during_session": False},
                                               {"path": "/v1/plans", "during_session": True}]}}
        self.assertTrue(audit(har(entry("https://license.example/v1/plans")), allow, START, STOP)["pass"])
        self.assertFalse(audit(har(entry("https://license.example/v1/other")), allow, START, STOP)["pass"])


class Command(unittest.TestCase):
    def test_the_command_needs_a_timezone_and_records_the_log_and_the_machine(self):
        """Mốc không múi giờ là lỗi; kết quả ghi mã băm nhật ký và nơi chạy (Q1, Q3 của review 08 lần 2)."""
        with tempfile.TemporaryDirectory() as d:
            paths = {n: os.path.join(d, n) for n in ("a.har", "allow.json", "out.json", "app.log")}
            with open(paths["app.log"], "w", encoding="utf-8") as f:
                f.write(LOG)
            for name, data in (("a.har", har(entry("https://license.example/v1/plans"))), ("allow.json", ALLOW)):
                with open(paths[name], "w", encoding="utf-8") as f:
                    json.dump(data, f)
            args = [paths["a.har"], "--allow", paths["allow.json"], "--out", paths["out.json"], "--app-log", paths["app.log"]]
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as naive:
                main(args + ["--start", "2026-10-03T10:00:00", "--stop", "2026-10-03T11:00:00"])
            self.assertEqual(naive.exception.code, 2)
            with contextlib.redirect_stdout(io.StringIO()):
                code = main(args + ["--start", "2026-10-03T10:00:00+07:00", "--stop", "2026-10-03T10:30:00+07:00"])
            with open(paths["out.json"], encoding="utf-8") as f:
                out = json.load(f)
        self.assertEqual(code, 0)
        self.assertRegex(out["har_sha256"], "^[0-9a-f]{64}$")
        self.assertEqual(out["window"], ["2026-10-03T10:00:00+07:00", "2026-10-03T10:59:58+07:00"], "theo log của app")
        self.assertEqual((out["os"], out["host"]), (origin()["os"], origin()["host"]))


if __name__ == "__main__":
    unittest.main()
