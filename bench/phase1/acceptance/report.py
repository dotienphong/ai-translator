"""Báo cáo nghiệm thu Giai đoạn 1 (spec §3.3): gom kết quả A1–A7 và bảng đối chiếu thành một file Markdown.

Đọc thư mục kết quả (mặc định `bench/phase1/results/acceptance/`):
- `a1-matrix.md`: bảng ma trận tương thích, có cột `Kết quả` mang `đạt`, `không đạt` hay `chưa thử`;
- `a2-*.json`: kết quả `gates.py a2`, mỗi file một máy; cần hạng khuyến nghị và hạng tối thiểu, đo trên hai máy khác nhau;
- `a3.json`: kết quả `gates.py a3`;
- `a4-*.json`: kết quả `gates.py a4`; cần gói `turbo` và `small`;
- `a5-*.json`: kết quả `soak.py summarize` (A5; dòng tải máy §8 lấy `pass_cpu` của cùng file); cần `mac` và `win`;
- `a6-checklist.md`: danh sách `- [x]` / `- [ ]` của phần cài đặt và gỡ (A6);
- `a7-*.json`: kết quả `netaudit.py`; cần `mac` và `win`.
Gói, hạng, máy, hệ điều hành đọc từ **nội dung** file (do công cụ ghi từ số đo hay từ máy đang chạy), không từ tên file (Q1
của review 08 lần 2). Thiếu một phần của tập bắt buộc (`REQUIRED`) là `chưa có số liệu`, kể cả khi các file có mặt đều
đạt; một file không đạt là `không đạt`.
Cộng bảng đối chiếu của kế hoạch 00 (Task 5: mọi dòng `xong`, hoặc `hoãn` có ngày duyệt).

Mỗi tiêu chí là `đạt`, `không đạt` hay `chưa có số liệu`. Báo cáo chung chỉ ĐẠT khi mọi tiêu chí đạt.
"""
import argparse
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mapping  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESULTS = os.path.join(ROOT, "bench", "phase1", "results", "acceptance")
PASS, FAIL, NONE = "đạt", "không đạt", "chưa có số liệu"
# Tập số liệu bắt buộc của từng tiêu chí (điểm cần quyết 2 của 08a cho A5): hai gói, hay một máy Mac và một máy Windows.
REQUIRED = {"a4": ("pack", ("turbo", "small")), "a5": ("os", ("mac", "win")), "a7": ("os", ("mac", "win"))}


def rel(path):
    return os.path.relpath(path, ROOT)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def from_json_files(paths, key="pass"):
    if not paths:
        return NONE
    return PASS if all(load(p).get(key) for p in paths) else FAIL


def required_set(results, prefix, key="pass"):
    """Trạng thái từ các file `<prefix>-*.json`: mọi file đạt, và trường `field` trong nội dung phủ đủ tập bắt buộc."""
    field, names = REQUIRED[prefix]
    paths = sorted(glob.glob(os.path.join(results, f"{prefix}-*.json")))
    have = set()
    for p in paths:
        data = load(p)
        if not data.get(key):
            return FAIL, paths, f"{os.path.basename(p)} không đạt"
        have.add(data.get(field))
    missing = [n for n in names if n not in have]
    if missing:
        return NONE, paths, "thiếu: " + ", ".join(missing)
    return PASS, paths, ", ".join(names)


def a1(results):
    path = os.path.join(results, "a1-matrix.md")
    if not os.path.exists(path):
        return NONE, [], "chưa có ma trận"
    with open(path, encoding="utf-8") as f:
        lines = [l for l in f.read().splitlines() if l.startswith("|")]
    if len(lines) < 3:
        return NONE, [path], "ma trận trống"
    header = [c.strip() for c in lines[0].strip("|").split("|")]
    col = header.index("Kết quả")
    values = [[c.strip() for c in l.strip("|").split("|")][col].lower() for l in lines[2:]]
    counts = {v: values.count(v) for v in (PASS, FAIL, "chưa thử")}
    detail = f"{len(values)} ô: đạt {counts[PASS]}, không đạt {counts[FAIL]}, chưa thử {counts['chưa thử']}"
    if counts[FAIL]:
        return FAIL, [path], detail
    if counts["chưa thử"] or counts[PASS] != len(values):
        return NONE, [path], detail
    return PASS, [path], detail


def a2(results):
    """Cần một máy hạng khuyến nghị và một máy hạng tối thiểu, hai máy khác nhau (hạng, máy do `gates.py a2` ghi)."""
    paths = sorted(glob.glob(os.path.join(results, "a2-*.json")))
    by_tier = {}
    for p in paths:
        data = load(p)
        if not data.get("pass"):
            return FAIL, paths, f"{os.path.basename(p)} không đạt"
        by_tier.setdefault(data.get("tier"), set()).add(data.get("machine"))
    missing = [t for t in ("khuyennghi", "toithieu") if t not in by_tier]
    if missing:
        return NONE, paths, "thiếu hạng: " + ", ".join(missing)
    if not by_tier["toithieu"] - by_tier["khuyennghi"] or not by_tier["khuyennghi"] - by_tier["toithieu"]:
        return NONE, paths, "hai hạng phải đo trên hai máy khác nhau"
    return PASS, paths, f"{len(paths)} máy"


def checklist(path):
    if not os.path.exists(path):
        return NONE, [], "chưa có danh sách"
    with open(path, encoding="utf-8") as f:
        text = f.read()
    done = len(re.findall(r"^- \[[xX]\] ", text, re.M))
    todo = len(re.findall(r"^- \[ \] ", text, re.M))
    detail = f"{done}/{done + todo} mục"
    if done + todo == 0:
        return NONE, [path], "danh sách trống"
    return (PASS if todo == 0 else NONE), [path], detail


def build(results, plan):
    rows = [("A1 Tương thích", *a1(results)), ("A2 Độ trễ", *a2(results))]
    a3p = [p for p in [os.path.join(results, "a3.json")] if os.path.exists(p)]
    rows.append(("A3 Chất lượng dịch", from_json_files(a3p), a3p, "chống thụt lùi và mức sàn"))
    rows.append(("A4 Nhận dạng giọng nói", *required_set(results, "a4")))
    rows.append(("A5 Ổn định (2 giờ)", *required_set(results, "a5", "pass_a5")))
    rows.append(("§8 Tải máy ≤ 30%", *required_set(results, "a5", "pass_cpu")))
    rows.append(("A6 Cài đặt", *checklist(os.path.join(results, "a6-checklist.md"))))
    rows.append(("A7 Quyền riêng tư", *required_set(results, "a7")))
    with open(plan, encoding="utf-8") as f:
        table, problems = mapping.parse(f.read())
    issues = mapping.release_problems(table, problems)
    rows.append(("Bảng đối chiếu (kế hoạch 00, Task 5)", PASS if not issues else FAIL, [plan],
                 f"{len(table)} dòng, {len(issues)} chưa xong"))
    return rows


def render(rows):
    overall = all(r[1] == PASS for r in rows)
    lines = ["# Báo cáo nghiệm thu Giai đoạn 1", "",
             f"Kết luận: **{'ĐẠT' if overall else 'CHƯA ĐẠT'}**", "",
             "| Tiêu chí | Kết quả | Chi tiết | Bằng chứng |", "|---|---|---|---|"]
    for name, status, paths, detail in rows:
        evidence = ", ".join(f"`{rel(p)}`" for p in paths) or "—"
        lines.append(f"| {name} | {status} | {detail} | {evidence} |")
    return "\n".join(lines) + "\n", overall


def main(argv=None):
    ap = argparse.ArgumentParser(description="Báo cáo nghiệm thu Giai đoạn 1.")
    ap.add_argument("--results", default=RESULTS)
    ap.add_argument("--plan", default=mapping.PLAN)
    ap.add_argument("--out", help="ghi báo cáo vào file này (mặc định chỉ in)")
    args = ap.parse_args(argv)
    text, overall = render(build(args.results, args.plan))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
    print(text, end="")
    return 0 if overall else 1


if __name__ == "__main__":
    sys.exit(main())
