"""Bảng đối chiếu spec → kế hoạch con (mục 4 của kế hoạch Phase 1 · 00).

Đếm trạng thái, nhóm các dòng chưa xong theo việc đang chặn (mã C, T, Q, P05-…, phần cần người, phần Windows, việc của
chủ dự án), và kiểm điều kiện phát hành của Task 5 kế hoạch 00: mọi dòng `xong`, hoặc `hoãn` có cụm "chủ dự án duyệt YYYY-MM-DD" trong
Ghi chú.

Chạy từ gốc repo:
  python3 bench/phase1/acceptance/mapping.py summary
  python3 bench/phase1/acceptance/mapping.py check
"""
import argparse
import json
import os
import re
import sys
from dataclasses import asdict, dataclass
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PLAN = os.path.join(ROOT, "docs", "superpowers", "plans", "2026-10-01-phase-1-00-tong-quan.md")
STATUSES = ("chưa làm", "đang làm", "chờ", "xong", "hoãn")
ROW = re.compile(r"^\| ([0-9]+) \|")
# Dòng trông như dòng của bảng (số ở cột đầu) mà sai khoảng trắng: báo lỗi, không bỏ qua (N3 của review 08 lần 2).
LOOSE_ROW = re.compile(r"^\|\s*[0-9]+\s*\|")
# Mã việc chờ (mục 5 kế hoạch 00) và điểm cần quyết. Không nhận "T8 `adb1e7b`": đó là Task 8 kèm SHA của commit.
CODE = re.compile(r"(?<![0-9A-Za-z])(C[0-9]+|T[0-9]+|Q[0-9]+|P05-[0-9]+)(?![0-9A-Za-z])(?! `)")
# Dòng `hoãn` ghi đúng cụm này trong Ghi chú; một ngày bất kỳ (ngày kiểm, ngày đo) không phải ngày duyệt.
APPROVED = re.compile(r"(?<!gửi )(?<!chờ )chủ dự án duyệt ([0-9]{4}-[0-9]{2}-[0-9]{2})")


@dataclass
class Row:
    num: int
    requirement: str
    plans: str
    note: str
    status: str
    line: int


def parse(text):
    """Trả (các dòng của bảng, các lỗi định dạng). Dòng của bảng là dòng bắt đầu bằng `| <số> |`."""
    rows, problems, seen = [], [], set()
    for i, line in enumerate(text.splitlines(), start=1):
        if not ROW.match(line):
            if LOOSE_ROW.match(line):
                problems.append(f"dòng {i}: sai định dạng (cần đúng \"| <số> |\")")
            continue
        cells = line.split("|")
        if len(cells) != 7:
            problems.append(f"dòng {i}: sai số cột ({len(cells) - 2} thay vì 5)")
            continue
        num = int(cells[1])
        status = cells[5].strip()
        if status not in STATUSES:
            problems.append(f"dòng {i} (#{num}): trạng thái lạ {status!r}")
        if num in seen:
            problems.append(f"dòng {i}: số {num} bị trùng")
        seen.add(num)
        rows.append(Row(num, cells[2].strip(), cells[3].strip(), cells[4].strip(), status, i))
    return rows, problems


def blockers(row):
    """Việc đang chặn một dòng chưa xong: mã trong Ghi chú, cộng phần cần người, Windows, chủ dự án ở cột Kế hoạch."""
    found = list(dict.fromkeys(CODE.findall(row.note)))
    if "(người)" in row.plans or "người" in row.note:
        found.append("người")
    if "(Win)" in row.plans or "Win)" in row.note or "Windows" in row.note:
        found.append("Windows")
    if "CDA" in row.plans:
        found.append("chủ dự án")
    return found or ["khác"]


def summary(rows):
    counts = {s: sum(r.status == s for r in rows) for s in STATUSES}
    groups = {}
    for r in rows:
        if r.status in ("xong", "hoãn"):
            continue
        for b in blockers(r):
            groups.setdefault(b, []).append(r.num)
    return counts, dict(sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])))


def approved(note):
    """Ghi chú có cụm "chủ dự án duyệt YYYY-MM-DD" với ngày có thật (không phải "gửi …", "chờ …" chủ dự án duyệt)."""
    for m in APPROVED.finditer(note):
        try:
            date.fromisoformat(m.group(1))
            return True
        except ValueError:
            continue
    return False


def release_problems(rows, problems):
    """Lý do chưa phát hành được (Task 5 kế hoạch 00); rỗng là đủ 100%."""
    out = list(problems)
    for r in rows:
        if r.status not in ("xong", "hoãn"):
            out.append(f"#{r.num}: {r.status}")
        elif r.status == "hoãn" and not approved(r.note):
            out.append(f"#{r.num}: hoãn mà Ghi chú không có \"chủ dự án duyệt YYYY-MM-DD\"")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="Bảng đối chiếu của kế hoạch Phase 1 · 00.")
    ap.add_argument("command", choices=["summary", "check"])
    ap.add_argument("--file", default=PLAN)
    ap.add_argument("--json", action="store_true", help="in JSON thay cho Markdown")
    args = ap.parse_args(argv)
    with open(args.file, encoding="utf-8") as f:
        rows, problems = parse(f.read())
    counts, groups = summary(rows)
    issues = release_problems(rows, problems)
    if args.json:
        print(json.dumps({"rows": len(rows), "counts": counts, "groups": groups, "problems": problems,
                          "release_ready": not issues, "pending": [asdict(r) for r in rows
                                                                   if r.status not in ("xong", "hoãn")]},
                         ensure_ascii=False, indent=1))
    elif args.command == "summary":
        parts = ", ".join(f"{s} {counts[s]}" for s in STATUSES)
        print(f"Tổng: {len(rows)} dòng; {parts}.")
        for p in problems:
            print(f"Lỗi định dạng: {p}")
        print("| Việc chặn | Số dòng | Dòng |")
        print("|---|---|---|")
        for name, nums in groups.items():
            print(f"| {name} | {len(nums)} | {', '.join(map(str, nums))} |")
    else:
        for p in issues:
            print(p)
        print("đủ 100%" if not issues else f"chưa đủ: {len(issues)} lý do")
    return 0 if args.command == "summary" or not issues else 1


if __name__ == "__main__":
    sys.exit(main())
