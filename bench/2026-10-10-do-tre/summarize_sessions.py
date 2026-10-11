"""Bảng Markdown từ kết quả của `latency-bench session` (spec 2026-10-10 §10.1; H7 của kế hoạch 00).

Dùng:  python3 bench/2026-10-10-do-tre/summarize_sessions.py <file.json>...
       python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare <nhãn cũ> <nhãn mới> <file.json>...
       python3 bench/2026-10-10-do-tre/summarize_sessions.py --targets [--compare …] <file.json>...
Với `--targets` (kế hoạch 02), in thêm bảng so mục tiêu §10.2 của spec 2026-10-10 theo nhóm lượt chạy (xem `targets_table`).

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


# Mục tiêu §10.2 của spec 2026-10-10 (M4 Pro, gói Chuẩn, chế độ dịch trong lúc nói bật); A2 và CPU như mốc S6.
TENTATIVE_P50_MS = 1200
STABLE_P50_MS = {"en": 2000, "vi": 2000, "ko": 2000, "zh": 3000, "ja": 3000}
FIRST_P90_MS = 2000
FLICKER_MAX = 0.10
A2_P50_MS, A2_P90_MS, A2_FIRST_P50_MS = 2000, 3000, 1000
CPU_MAX = 30.0


def verdict(text, ok):
    return f"{text} {'✓' if ok else '✗'}"


def ms_verdict(value, goal):
    return "—" if value is None else verdict(f"{value:.0f}", value <= goal)


def targets_table(reports):
    """So từng nhóm lượt chạy với mục tiêu §10.2 của spec 2026-10-10: trễ theo từ gộp theo tiếng nguồn; từ đầu câu tới chữ
    dịch đầu (p90, gộp mọi câu); độ nháy ổn định gộp theo đơn vị (tử và mẫu ở khóa `run`); A2 và CPU của session tệ
    nhất."""
    words, groups = {}, {}
    for name, report in reports:
        g = group_of(name)
        d = groups.setdefault(g, {"start": [], "changed": 0, "final": 0, "a2": [], "a2_90": [], "a2_first": [],
                                  "cpu": []})
        run, summary = report.get("run", {}), report.get("summary", {})
        d["changed"] += run.get("stable_changed_units") or 0
        d["final"] += run.get("final_units") or 0
        for key, col in (("a2_p50_ms", "a2"), ("a2_p90_ms", "a2_90"), ("a2_first_p50_ms", "a2_first"),
                         ("cpu_percent", "cpu")):
            if summary.get(key) is not None:
                d[col].append(summary[key])
        for u in report.get("utterances", []):
            if u.get("first_from_start_ms") is not None:
                d["start"].append(u["first_from_start_ms"])
            w = words.setdefault((g, u["lang"]), {"tentative": [], "stable": []})
            w["tentative"].extend(u.get("word_lag_tentative_ms", []))
            w["stable"].extend(u.get("word_lag_stable_ms", []))
    lines = [
        "| Nhóm | Tiếng nguồn | Theo từ, tạm p50 (≤ 1200) | Theo từ, ổn định p50 (mục tiêu) |",
        "|---|---|---|---|",
    ]
    for (g, lang), w in sorted(words.items()):
        goal = STABLE_P50_MS.get(lang, 2000)
        lines.append(f"| {g} | {lang} | {ms_verdict(percentile(w['tentative'], 50), TENTATIVE_P50_MS)} | "
                     f"{ms_verdict(percentile(w['stable'], 50), goal)} (≤ {goal}) |")
    lines += [
        "",
        "| Nhóm | Đầu câu → chữ dịch p90 (≤ 2000) | Nháy ổn định (≤ 10%) | A2 p50 tệ nhất (≤ 2000) "
        "| A2 p90 tệ nhất (≤ 3000) | A2 chữ đầu p50 tệ nhất (≤ 1000) | CPU % tệ nhất (≤ 30) |",
        "|---|---|---|---|---|---|---|",
    ]
    for g, d in sorted(groups.items()):
        flicker = d["changed"] / d["final"] if d["final"] else None
        cpu = max(d["cpu"], default=None)
        cells = [
            ms_verdict(percentile(d["start"], 90), FIRST_P90_MS),
            "—" if flicker is None else verdict(f"{flicker * 100:.1f}%", flicker <= FLICKER_MAX),
            ms_verdict(max(d["a2"], default=None), A2_P50_MS),
            ms_verdict(max(d["a2_90"], default=None), A2_P90_MS),
            ms_verdict(max(d["a2_first"], default=None), A2_FIRST_P50_MS),
            "—" if cpu is None else verdict(f"{cpu:.1f}", cpu <= CPU_MAX),
        ]
        lines.append(f"| {g} | " + " | ".join(cells) + " |")
    return lines


def main(argv):
    targets = argv[:1] == ["--targets"]
    if targets:
        argv = argv[1:]
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
    if targets:
        print()
        print("\n".join(targets_table(reports)))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1:])
