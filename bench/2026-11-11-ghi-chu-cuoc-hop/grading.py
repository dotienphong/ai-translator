"""Phiếu chấm mù (kế hoạch 01, Task 9).

  python -I grading.py make <out_dir> <set_dir> <grading_dir> --systems a,b,…
  python -I grading.py score <grading_dir> > results/cham-tay.md

`make` ghi mỗi bản chép lời một file CSV (UTF-8 có BOM), hệ được thay bằng mã chữ cái xáo ngẫu nhiên theo từng bản; bảng
giải mã ở `key.json` (người chấm không mở). `score` đọc các phiếu đã điền ba cột cuối."""
import argparse
import csv
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # `python -I` không tự thêm thư mục script
from notes_lib import render_lines  # noqa: E402

COLUMNS = ["he", "loai", "text", "owner", "due", "refs", "bang_chung", "dung", "refs_dung", "nhom", "loai_loi"]
KINDS = (("decisions", "decision"), ("action_items", "action"), ("open_questions", "question"))


def make(out_dir: str, set_dir: str, grading_dir: str, systems: list[str]) -> int:
    os.makedirs(grading_dir, exist_ok=True)
    key: dict[str, dict[str, str]] = {}
    rng = random.SystemRandom()
    for fname in sorted(os.listdir(set_dir)):
        if not fname.endswith(".jsonl"):
            continue
        name = fname[:-len(".jsonl")]
        with open(os.path.join(set_dir, fname), encoding="utf-8") as f:
            by_seq = {l["seq"]: l for l in (json.loads(row) for row in f if row.strip())}
        present = [s for s in systems if os.path.exists(os.path.join(out_dir, s, f"{name}.json"))]
        if not present:
            continue
        order = present[:]
        rng.shuffle(order)
        key[name] = {chr(ord("A") + i): s for i, s in enumerate(order)}
        with open(os.path.join(grading_dir, f"{name}.csv"), "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=COLUMNS)
            w.writeheader()
            for letter, system in key[name].items():
                with open(os.path.join(out_dir, system, f"{name}.json"), encoding="utf-8") as g:
                    notes = json.load(g)["job"]["notes"] or {}
                for field, kind in KINDS:
                    for item in notes.get(field, []):
                        refs = item.get("refs", [])
                        w.writerow({"he": letter, "loai": kind, "text": item["text"], "owner": item.get("owner", ""),
                                    "due": item.get("due", ""), "refs": " ".join(str(r) for r in refs),
                                    "bang_chung": render_lines([by_seq[r] for r in refs if r in by_seq]).strip(),
                                    "dung": "", "refs_dung": "", "nhom": "", "loai_loi": ""})
    with open(os.path.join(grading_dir, "key.json"), "w", encoding="utf-8") as f:
        json.dump(key, f, ensure_ascii=False, indent=1)
    print(f"{len(key)} phiếu ở {grading_dir}")
    return 0


def score(rows: list[dict], key: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    groups: dict[str, dict[str, set[str]]] = {}   # name → hệ → các nhóm việc đúng
    refs_seen: dict[str, list[int]] = {}
    for n, r in enumerate(rows, 2):
        where = f"{r.get('file', r['name'])} dòng {r.get('line', n)}"
        system = key[r["name"]][r["he"]]
        s = out.setdefault(system, {"bia": 0, "bia_han": 0, "sai_chi_tiet": 0, "refs_dung": 0.0, "recall": 0.0,
                                    "items": 0})
        refs_seen.setdefault(system, [0, 0])
        groups.setdefault(r["name"], {}).setdefault(system, set())
        dung = r["dung"].strip()
        if dung not in ("0", "1"):
            raise ValueError(f"{where}: ô `dung` phải là 0 hay 1")
        s["items"] += 1
        if r["loai"] == "action" and dung == "0":
            s["bia"] += 1
            if "loai_loi" in r:  # phiếu vòng 3: tách bịa hẳn với có thật nhưng sai chi tiết
                kind = (r["loai_loi"] or "").strip()
                if kind not in ("bia", "chi_tiet"):
                    raise ValueError(f"{where}: việc cần làm sai phải có `loai_loi` là bia hay chi_tiet")
                s["bia_han" if kind == "bia" else "sai_chi_tiet"] += 1
        if dung == "1" and r["refs"].strip():
            mark = r["refs_dung"].strip()
            if mark not in ("0", "1"):
                raise ValueError(f"{where}: mục đúng có `refs` thì ô `refs_dung` phải là 0 hay 1")
            refs_seen[system][0] += 1
            refs_seen[system][1] += mark == "1"
        if r["loai"] == "action" and dung == "1":
            if not r["nhom"].strip():
                raise ValueError(f"{where}: việc cần làm đúng phải có `nhom`")
            groups[r["name"]][system].add(r["nhom"].strip())
    for system, s in out.items():
        total, good = refs_seen[system]
        s["refs_dung"] = good / total if total else 0.0
        ratios = []
        for name, per_system in groups.items():
            everyone = set().union(*per_system.values())
            if everyone and system in per_system:
                ratios.append(len(per_system[system]) / len(everyone))
        s["recall"] = sum(ratios) / len(ratios) if ratios else 0.0
    return out


def read_sheets(grading_dir: str) -> list[dict]:
    rows = []
    for fname in sorted(os.listdir(grading_dir)):
        if not fname.endswith(".csv"):
            continue
        with open(os.path.join(grading_dir, fname), encoding="utf-8-sig", newline="") as f:
            for line, r in enumerate(csv.DictReader(f), 2):
                rows.append({**r, "name": fname[:-len(".csv")], "file": fname, "line": line})
    return rows


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("make")
    m.add_argument("out_dir"), m.add_argument("set_dir"), m.add_argument("grading_dir")
    m.add_argument("--systems", required=True)
    s = sub.add_parser("score")
    s.add_argument("grading_dir")
    args = ap.parse_args(argv)
    if args.cmd == "make":
        return make(args.out_dir, args.set_dir, args.grading_dir, [x for x in args.systems.split(",") if x])
    with open(os.path.join(args.grading_dir, "key.json"), encoding="utf-8") as f:
        key = json.load(f)
    result = score(read_sheets(args.grading_dir), key)
    print("| Hệ | Số mục | Việc cần làm sai (`bia`) | Bịa hẳn | Sai chi tiết | `refs` đúng | Recall việc cần làm |\n"
          "|---|---|---|---|---|---|---|")
    for system in sorted(result):
        s = result[system]
        print(f"| {system} | {s['items']} | {s['bia']} | {s['bia_han']} | {s['sai_chi_tiet']} | "
              f"{s['refs_dung'] * 100:.1f}% | {s['recall'] * 100:.1f}% |")
    return 0


if __name__ == "__main__":
    sys.exit(main())
