"""Tóm tắt bản ghi số liệu của `uia-record stats` (kế hoạch 05): mỗi dòng {"t", "pass", "ms", "elements", "status", "tiles",
"timeouts", "denied"}, không có tên người. In số lượt, thời gian lượt đầy đủ và nhanh (p50, p90, lớn nhất), số lượt quá 30 ms, số lệnh
đọc p90, phân bố trạng thái và số ô, số lệnh quá hạn và bị chặn.

python3 -I tom_tat_do.py <do-*.jsonl>...
"""
import json
import sys
from collections import Counter


def quantile(values, p):
    if not values:
        return 0.0
    v = sorted(values)
    return v[round((len(v) - 1) * p)]


def summarize(path):
    rows = [json.loads(line) for line in open(path, encoding="utf-8") if line.strip()]
    full = [r["ms"] for r in rows if r["pass"] == "Full"]
    fast = [r["ms"] for r in rows if r["pass"] == "Fast"]
    elements = [r["elements"] for r in rows if r["pass"] in ("Full", "Fast")]
    out = [f"== {path}: {len(rows)} lượt"]
    for name, v in (("đầy đủ", full), ("nhanh", fast)):
        out.append(
            f"  lượt {name}: {len(v)} lượt, p50 {quantile(v, 0.5):.1f} ms, p90 {quantile(v, 0.9):.1f}, lớn nhất {max(v, default=0.0):.1f}"
        )
    over = sum(1 for ms in full + fast if ms > 30.0)
    out.append(f"  quá 30 ms: {over}; lệnh đọc p90: {quantile(elements, 0.9):.0f}, lớn nhất {max(elements, default=0)}")
    out.append("  trạng thái: " + ", ".join(f"{k} {v}" for k, v in sorted(Counter(r["status"] for r in rows).items())))
    out.append("  số ô: " + ", ".join(f"{k} ô × {v}" for k, v in sorted(Counter(r["tiles"] for r in rows).items())))
    out.append(f"  lệnh quá hạn: {sum(r['timeouts'] for r in rows)}, bị chặn: {sum(r.get('denied', 0) for r in rows)}")
    return "\n".join(out)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        print(summarize(p))
