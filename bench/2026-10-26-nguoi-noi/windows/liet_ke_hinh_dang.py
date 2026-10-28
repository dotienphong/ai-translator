"""Liệt kê HÌNH DẠNG (vai trò, vai trò phụ, id, lớp) trong bản ghi cây của `uia-record fixture` (kế hoạch 05), để chọn công thức:
mỗi hình dạng một dòng, kèm số ảnh chụp có nó, số dòng trung bình mỗi ảnh và độ sâu. Không in chữ (tên, nhãn). Với
`--onset <lớp> --truth <truth.json>`: độ trễ từ lúc mỗi khách bật mic tới lúc dòng có lớp đó xuất hiện (trong ảnh chụp đầu tiên sau
lúc bật mà ảnh chụp liền trước chưa có), theo từng khách; dùng bản ghi thô (`t` là giờ Unix), không dùng fixture đã ẩn danh.

`--khop <regex>`: chỉ xét dòng có `title` hay `desc` khớp mẫu (để tìm hình dạng của ô theo nhãn của nó mà không in nhãn).

python3 -I liet_ke_hinh_dang.py <cay-*.jsonl> [--min-anh 1] [--khop <regex>] [--onset <lớp> --truth <truth.json>]
"""
import argparse
import json
import re
import statistics
from collections import defaultdict


def fields(line):
    f = line.split("|", 9)
    return f if len(f) == 10 else None


def shape_of(f):
    return (f[1], f[2], f[6] or f[8], " ".join(sorted(f[9].split())))


def table(snaps, label=None):
    seen = defaultdict(int)
    count = defaultdict(list)
    depth = defaultdict(set)
    for s in snaps:
        per = defaultdict(int)
        for line in s["lines"]:
            f = fields(line)
            if f is None:
                continue
            if label is not None and not (label.search(f[3]) or label.search(f[4])):
                continue
            k = shape_of(f)
            per[k] += 1
            depth[k].add(int(f[0]))
        for k, n in per.items():
            seen[k] += 1
            count[k].append(n)
    return seen, count, depth


def onsets(snaps, token, truth):
    """`t` của ảnh chụp (bản ghi thô của `uia-record fixture`) và của sự thật đều là giờ Unix: so trực tiếp."""
    has = [any(token in (fields(x) or [""] * 10)[9].split() for x in s["lines"]) for s in snaps]
    out = defaultdict(list)
    for step in sorted(truth["steps"], key=lambda s: s["t"]):
        if not step["on"]:
            continue
        for i in range(1, len(snaps)):
            if snaps[i]["t"] >= step["t"] and has[i] and not has[i - 1]:
                out[step["g"]].append(snaps[i]["t"] - step["t"])
                break
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fixture")
    ap.add_argument("--min-anh", type=int, default=1)
    ap.add_argument("--khop")
    ap.add_argument("--onset")
    ap.add_argument("--truth")
    a = ap.parse_args()
    snaps = [json.loads(line) for line in open(a.fixture, encoding="utf-8") if line.strip()]
    if a.onset:
        truth = json.load(open(a.truth, encoding="utf-8"))
        for g, v in sorted(onsets(snaps, a.onset, truth).items()):
            print(f"{g}: {len(v)} lần, trung vị {statistics.median(v):.2f} s, lớn nhất {max(v):.2f} s")
        return
    seen, count, depth = table(snaps, re.compile(a.khop) if a.khop else None)
    print(f"{len(snaps)} ảnh chụp")
    for k in sorted(seen, key=lambda k: (-seen[k], k)):
        if seen[k] < a.min_anh:
            continue
        role, sub, ident, cls = k
        d = sorted(depth[k])
        print(f"{seen[k]:5d} ảnh, {statistics.mean(count[k]):5.1f}/ảnh, sâu {d[0]}–{d[-1]}  {role}|{sub}|{ident}|{cls}")


if __name__ == "__main__":
    main()
