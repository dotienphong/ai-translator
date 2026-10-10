"""Bảng Markdown từ kết quả của `latency-bench session` (spec 2026-10-10 §10.1; H7 của kế hoạch 00).

Dùng:  python3 bench/2026-10-10-do-tre/summarize_sessions.py <file.json>...
       python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare <nhãn cũ> <nhãn mới> <file.json>...

In hai bảng:
1. mỗi file một dòng, các khóa của `summary` (ms; tỉ lệ in bằng %; không có số thì "—");
2. trễ theo từ và "từ đầu câu tới chữ dịch đầu tiên", gộp mọi câu cùng tiếng nguồn trong cùng một nhóm lượt chạy (tên file
   bỏ phần session ở cuối, ví dụ `buoc1-moc-chuan`), để so với ngưỡng theo tiếng ở spec §10.2.
Với `--compare`, in thêm bảng so hai lượt chạy: mỗi gói và session có ở cả hai nhãn (`<nhãn>-<gói>-<session>.json`) một
dòng, mỗi ô là "cũ → mới (chênh)". Hai cột cuối (chép lời, dịch p50) lấy ở khóa `run` của file.

Đọc được cả file đầy đủ (có `events`) lẫn bản rút gọn mà `run_sessions.py` ghi vào `results/`. Chỉ dùng thư viện chuẩn.
"""
import json
import os
import sys

# (khóa của `summary`, tiêu đề cột)
COLUMNS = [
    ("a2_p50_ms", "A2 p50"),
    ("a2_p90_ms", "A2 p90"),
    ("a2_first_p50_ms", "A2 chữ đầu p50"),
    ("first_from_start_p50_ms", "Đầu câu → chữ dịch p50"),
    ("first_from_start_p90_ms", "p90"),
    ("word_lag_tentative_p50_ms", "Theo từ, tạm p50"),
    ("word_lag_tentative_p90_ms", "p90"),
    ("word_lag_stable_p50_ms", "Theo từ, ổn định p50"),
    ("word_lag_stable_p90_ms", "p90"),
    ("stable_flicker_ratio", "Nháy ổn định"),
    ("tentative_erasure_ratio", "Nháy tạm"),
    ("busy_ratio", "Bận"),
    ("cpu_percent", "CPU %"),
    ("utterances", "Câu"),
    ("segments", "Đoạn"),
    ("partials", "Chép từng phần"),
    ("cadence_p50_ms", "Nhịp p50"),
    ("streaming_auto_off", "Tự tắt"),
]
RATIOS = {"stable_flicker_ratio", "tentative_erasure_ratio", "busy_ratio"}
# Khóa so ở bảng `--compare`: khóa của `summary`, hay của `run` (`asr_p50_ms`, `mt_p50_ms`).
COMPARED = [
    ("a2_p50_ms", "A2 p50"),
    ("a2_first_p50_ms", "A2 chữ đầu p50"),
    ("first_from_start_p50_ms", "Đầu câu → chữ dịch p50"),
    ("first_from_start_p90_ms", "p90"),
    ("word_lag_tentative_p50_ms", "Theo từ, tạm p50"),
    ("word_lag_stable_p50_ms", "Theo từ, ổn định p50"),
    ("tentative_erasure_ratio", "Nháy tạm"),
    ("busy_ratio", "Bận"),
    ("cpu_percent", "CPU %"),
    ("asr_p50_ms", "Chép lời p50"),
    ("mt_p50_ms", "Dịch p50"),
]


def cell(key, value):
    """Một ô: tỉ lệ in bằng %, CPU một chữ số thập phân, còn lại làm tròn tới đơn vị; không có số thì "—"."""
    if value is None:
        return "—"
    if key in RATIOS:
        return f"{value * 100:.1f}%"
    if key == "cpu_percent":
        return f"{value:.1f}"
    return f"{value:.0f}"


def percentile(values, p):
    """Phân vị nội suy tuyến tính như `numpy.percentile` (và `stats::percentile` của latency-bench); rỗng thì None."""
    if not values:
        return None
    v = sorted(values)
    rank = p / 100 * (len(v) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (rank - lo)


def name_of(path):
    return os.path.basename(path).removesuffix(".json")


def group_of(name):
    """Nhóm lượt chạy: tên file bỏ phần session ở cuối (`buoc1-moc-chuan-en` thành `buoc1-moc-chuan`)."""
    return name.rsplit("-", 1)[0]


def session_table(reports):
    lines = [
        "| Lượt | " + " | ".join(title for _, title in COLUMNS) + " |",
        "|" + "---|" * (len(COLUMNS) + 1),
    ]
    for name, report in reports:
        summary = report.get("summary", {})
        lines.append(f"| {name} | " + " | ".join(cell(k, summary.get(k)) for k, _ in COLUMNS) + " |")
    return lines


def language_table(reports):
    pooled = {}
    for name, report in reports:
        for u in report.get("utterances", []):
            d = pooled.setdefault((group_of(name), u["lang"]), {"tentative": [], "stable": [], "start": []})
            d["tentative"].extend(u.get("word_lag_tentative_ms", []))
            d["stable"].extend(u.get("word_lag_stable_ms", []))
            if u.get("first_from_start_ms") is not None:
                d["start"].append(u["first_from_start_ms"])

    def ms(v):
        return "—" if v is None else f"{v:.0f}"

    lines = [
        "| Nhóm | Tiếng nguồn | Từ có chữ dịch | Tạm p50 | Tạm p90 | Ổn định p50 | Ổn định p90 "
        "| Đầu câu → chữ dịch p50 | p90 |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for (group, lang), d in sorted(pooled.items()):
        t, s, f = d["tentative"], d["stable"], d["start"]
        lines.append(
            f"| {group} | {lang} | {len(t)} | {ms(percentile(t, 50))} | {ms(percentile(t, 90))} | "
            f"{ms(percentile(s, 50))} | {ms(percentile(s, 90))} | {ms(percentile(f, 50))} | {ms(percentile(f, 90))} |"
        )
    return lines


def compare_cell(key, old, new):
    """Một ô "cũ → mới (chênh)"; thiếu một bên thì không có chênh."""
    if old is None or new is None:
        return f"{cell(key, old)} → {cell(key, new)}"
    diff = new - old
    if key in RATIOS:
        return f"{cell(key, old)} → {cell(key, new)} ({diff * 100:+.1f})"
    if key == "cpu_percent":
        return f"{cell(key, old)} → {cell(key, new)} ({diff:+.1f})"
    return f"{cell(key, old)} → {cell(key, new)} ({diff:+.0f})"


def value(report, key):
    """Số của khóa `key` trong `summary`, không có thì trong `run`."""
    summary = report.get("summary", {})
    return summary[key] if key in summary else report.get("run", {}).get(key)


def compare_table(reports, old_label, new_label):
    """So hai lượt chạy: mỗi `<gói>-<session>` có ở cả hai nhãn một dòng."""
    by_name = dict(reports)
    lines = ["| Gói-session | " + " | ".join(title for _, title in COMPARED) + " |", "|" + "---|" * (len(COMPARED) + 1)]
    keys = sorted(n.removeprefix(old_label + "-") for n in by_name if n.startswith(old_label + "-"))
    for key in keys:
        old, new = by_name.get(f"{old_label}-{key}"), by_name.get(f"{new_label}-{key}")
        if new is None:
            continue
        cells = [compare_cell(k, value(old, k), value(new, k)) for k, _ in COMPARED]
        lines.append(f"| {key} | " + " | ".join(cells) + " |")
    return lines


def main(argv):
    compare = None
    if argv[:1] == ["--compare"]:
        if len(argv) < 4:
            raise SystemExit(__doc__)
        compare, argv = (argv[1], argv[2]), argv[3:]
    reports = []
    for path in argv:
        with open(path, encoding="utf-8") as f:
            reports.append((name_of(path), json.load(f)))
    reports.sort(key=lambda r: r[0])
    print("\n".join(session_table(reports)))
    print()
    print("\n".join(language_table(reports)))
    if compare:
        print()
        print("\n".join(compare_table(reports, *compare)))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1:])
