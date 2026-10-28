"""Chấm A-spk3 (tên thật trên phụ đề) từ bản chép lời xuất ra của một cuộc họp thử có lịch nói đã biết.

Dùng: python -I score_names_export.py <chep-loi.txt> <lich.json> [--offset-s N] [--tol-s 1.5] [--min-words 3] [--min-turns 2]

- `chep-loi.txt`: bản TXT xuất ra hay "Sao chép tất cả" (mỗi dòng `[HH:MM:SS] Tên: câu gốc`, kế đó `→ bản dịch`; dòng không nhãn là
  `[HH:MM:SS] câu gốc`). Tên người ghi trong file này nên chỉ để ở thư mục dữ liệu ngoài repo.
- `lich.json`: `[{"name": "...", "start": "HH:MM:SS", "end": "HH:MM:SS"}, ...]`, giờ đồng hồ của máy chạy app, theo thứ tự nói.
- Một dòng chép lời được tính khi giờ của nó rơi vào đúng MỘT lượt nói (nới `--tol-s` giây mỗi đầu) và có từ `--min-words` từ trở lên
  (xấp xỉ "dòng ≥ 1 s"). Chỉ tính các lượt sau khi mỗi người đã nói đủ `--min-turns` lượt ("sau khi mỗi người đã nói ≥ 2 lượt").
- Nhãn chung ("Người 3", "Speaker 2", "話者1", "说话人1", "화자 1") là *không tên*; nhãn khác tên đúng là *sai tên*.

Đạt (spec §12, A-spk3): đúng tên ≥ 90% và sai tên ≤ 5% trên các dòng được tính. In JSON; thoát 0 nếu đạt, 1 nếu không.
"""
import argparse
import json
import re
import sys

GENERIC = re.compile(r"^(Người|Speaker|話者|说话人|화자) ?\d+$")
LINE = re.compile(r"^\[(\d{1,2}):(\d{2}):(\d{2})\] (.*)$")


def secs(text):
    h, m, s = (int(x) for x in text.split(":"))
    return h * 3600 + m * 60 + s


def parse_export(text):
    """[(giờ_giây, nhãn hay None, câu gốc)]: dòng `→` và dòng trống bị bỏ."""
    out = []
    for raw in text.splitlines():
        m = LINE.match(raw.strip())
        if not m:
            continue
        t = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        body = m.group(4)
        label, sep, rest = body.partition(": ")
        if sep and 0 < len(label) <= 40:
            out.append((t, label.strip(), rest.strip()))
        else:
            out.append((t, None, body.strip()))
    return out


def score(lines, turns, offset_s=0.0, tol_s=1.5, min_words=3, min_turns=2):
    """Đếm đúng tên, sai tên, nhãn chung, không nhãn trên các dòng được tính."""
    names = sorted({t["name"] for t in turns})
    seen = {n: 0 for n in names}
    eligible_after = None
    for t in turns:
        seen[t["name"]] += 1
        if eligible_after is None and all(v >= min_turns for v in seen.values()):
            eligible_after = secs(t["end"])
    counted = correct = wrong = generic = none = 0
    if eligible_after is None:
        return {"counted": 0, "correct": 0, "wrong": 0, "generic": 0, "none": 0, "eligible": False, "turns": len(turns)}
    for t, label, text in lines:
        t = t + offset_s
        if t < eligible_after or len(text.split()) < min_words:
            continue
        hits = [x for x in turns if secs(x["start"]) - tol_s <= t <= secs(x["end"]) + tol_s]
        if len(hits) != 1:
            continue
        counted += 1
        if label is None:
            none += 1
        elif GENERIC.match(label):
            generic += 1
        elif label == hits[0]["name"]:
            correct += 1
        else:
            wrong += 1
    return {"counted": counted, "correct": correct, "wrong": wrong, "generic": generic, "none": none, "eligible": True, "turns": len(turns)}


def verdict(r):
    if not r["eligible"] or r["counted"] == 0:
        return False
    return r["correct"] / r["counted"] >= 0.90 and r["wrong"] / r["counted"] <= 0.05


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("export")
    ap.add_argument("schedule")
    ap.add_argument("--offset-s", type=float, default=0.0)
    ap.add_argument("--tol-s", type=float, default=1.5)
    ap.add_argument("--min-words", type=int, default=3)
    ap.add_argument("--min-turns", type=int, default=2)
    a = ap.parse_args(argv)
    lines = parse_export(open(a.export, encoding="utf-8").read())
    turns = json.load(open(a.schedule, encoding="utf-8"))
    r = score(lines, turns, a.offset_s, a.tol_s, a.min_words, a.min_turns)
    r["pass"] = verdict(r)
    if r["counted"]:
        r["correct_rate"] = round(r["correct"] / r["counted"], 4)
        r["wrong_rate"] = round(r["wrong"] / r["counted"], 4)
    print(json.dumps(r, ensure_ascii=False))
    return 0 if r["pass"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
