"""cd scripts/speaker-recipes && python3 -I -B test_make_fixture.py (hay `python3 -B -m unittest test_make_fixture`).
Kiểm phần ẩn danh của `make_fixture.py` với dữ liệu tổng hợp (không cần bản ghi thật): lớp `bkg_<base64>` của Teams mã hóa một
mảnh định danh tài khoản (8 ký tự hex + "8guest…"/"8livecid"), phải thành id giả ổn định và phép kiểm rò phải bắt khi còn sót."""
import base64
import contextlib
import io
import json
import os
import sys
import tempfile
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import re  # noqa: E402

from make_fixture import Anonymizer, cmd_review, fields, leaks, meeting_lines, snapshot_lines  # noqa: E402

# Định danh giả (hex không thuộc tài khoản nào), mã hóa như Teams: base64 chuẩn, bỏ "=".
FAKE_GUEST = "bkg_" + base64.b64encode(b"deadbeef8guest01").decode().rstrip("=")
FAKE_LIVE = "bkg_" + base64.b64encode(b"0badc0de8livecid").decode().rstrip("=")


def line(lop, value="", dom=""):
    return f"3|AXGroup||||{value}|||{dom}|{lop}"


class BkgTest(unittest.TestCase):
    def test_bkg_classes_become_stable_fake_ids_everywhere(self):
        anon = Anonymizer({})
        a = fields(anon.line(fields(line(f"{FAKE_GUEST} vdi-frame-occlusion", value=FAKE_LIVE))))
        b = fields(anon.line(fields(line(f"{FAKE_LIVE} {FAKE_GUEST}", dom=f"x-{FAKE_GUEST}"))))
        # Thứ tự xuất hiện trong dòng: value (trường 5) đứng trước lớp (trường 9).
        self.assertEqual(a[5], "bkg_anon-1")
        self.assertEqual(a[9], "bkg_anon-2 vdi-frame-occlusion")
        self.assertEqual(b[9], "bkg_anon-1 bkg_anon-2")
        self.assertEqual(b[8], "x-bkg_anon-2")
        self.assertEqual(leaks("\n".join("|".join(f) for f in (a, b)), []), {})

    def test_fake_bkg_ids_do_not_shift_account_ids(self):
        anon = Anonymizer({})
        out = fields(anon.line(fields(line(FAKE_GUEST, value="8:guest:abc"))))
        self.assertEqual((out[5], out[9]), ("anon-1", "bkg_anon-1"))

    def test_leaks_catches_leftover_bkg_token(self):
        self.assertIn("lớp bkg_ chưa thay", leaks(line(f"fui-Flex {FAKE_GUEST}"), []))

    def test_leaks_catches_base64_account_id_in_any_long_token(self):
        urlsafe = base64.urlsafe_b64encode(b"\xfb0badc0de8livecid").decode()  # có "-"/"_" và padding
        for token in (FAKE_LIVE[4:], FAKE_LIVE[4:] + "==", "id-" + FAKE_GUEST[4:], urlsafe, urlsafe.rstrip("=")):
            with self.subTest(token=token):
                self.assertIn("định danh base64", leaks(line("", dom=token), []))

    def test_leaks_ignores_ordinary_ui_tokens(self):
        ordinary = [
            "VYBDae-Bz112c-LgbsSe-OWXEXe-SfQLQb-suEOdc",
            "tB5Jxf-xl07Ob-XxIAqe-OWXEXe-oYxtQd",
            "roster-participants-search-input",
            "EmbeddedBrowserTabRootView",
            "bkg_anon-1",
        ]
        self.assertEqual(leaks("\n".join(line(t, dom=t) for t in ordinary), []), {})


class ReviewTest(unittest.TestCase):
    def test_review_prints_basename_and_marks_blank_values(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "x.jsonl")
            with open(path, "w", encoding="utf-8") as f:
                f.write(json.dumps({"t": 0, "lines": [line("", value="   "), line("", value="Lan")]}) + "\n")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                cmd_review(types.SimpleNamespace(files=[path]))
        text = out.getvalue()
        self.assertIn("== x.jsonl\n", text)
        self.assertNotIn(d, text)
        self.assertIn("⟨chỉ khoảng trắng, 3 ký tự⟩", text)
        self.assertIn("-- value: 2 chuỗi khác nhau", text)


class WindowsRolesTest(unittest.TestCase):
    """Kế hoạch 05: bản ghi của `uia-record fixture` (khóa `lines`, vai trò là tên loại điều khiển UI Automation)."""

    def test_snapshot_lines_accepts_texts_and_lines(self):
        self.assertEqual(snapshot_lines({"t": 0, "texts": ["a"]}), ["a"])
        self.assertEqual(snapshot_lines({"t": 0, "lines": ["b"]}), ["b"])

    def test_windows_roles_pick_the_meeting_window_and_its_document(self):
        def row(depth, role, title="", value="", cls=""):
            return f"{depth}|{role}||{title}||{value}|||" + f"|{cls}"

        lines = [
            row(0, "Window", "Meet - abc-defg-hij - Google Chrome"),
            row(1, "Button", "Dấu trang riêng", cls="BookmarkButton"),
            row(2, "Document", "Meet - abc-defg-hij"),
            row(3, "Group", cls="oZRSLe"),
            row(2, "Document", "Gmail - Hộp thư"),
            row(3, "Text", "thư riêng", "thư riêng"),
            row(0, "Window", "Notepad"),
        ]
        title = re.compile(r"^Meet - ")
        kept = meeting_lines(lines, re.compile(r"Meet - "), True, None)
        self.assertEqual([f[1] for f in kept], ["Window", "Document", "Group"])
        self.assertEqual(len(meeting_lines(lines, re.compile(r"Meet - "), False, None)), 6)
        self.assertEqual(len(meeting_lines(lines, re.compile(r"Notepad"), False, None)), 1)
        self.assertIsNotNone(title.search("Meet - x"))


if __name__ == "__main__":
    unittest.main()
