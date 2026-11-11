"""`$DATA/raw/<lang>-{chuan,nhe}.md` (định dạng Xuất Markdown của app) → 20 file `$DATA/set/<lang>-<gói>-<phút>.jsonl`.

Chạy: python -I build_set.py <raw_dir> <set_dir>. In mỗi file: số câu, số câu bị bỏ, số câu không có bản dịch."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # `python -I` không tự thêm thư mục script
from notes_lib import parse_markdown_export, prefix

LANGS = ("en", "zh", "ja", "ko", "vi")
CUTS = {"chuan": (10, 30, 60), "nhe": (30,)}


def main(raw_dir: str, set_dir: str) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(set_dir, exist_ok=True)
    print("| File | Số câu | Bị bỏ | Không có bản dịch |\n|---|---|---|---|")
    bad = 0
    for lang in LANGS:
        for pack, cuts in CUTS.items():
            with open(os.path.join(raw_dir, f"{lang}-{pack}.md"), encoding="utf-8") as f:
                lines = parse_markdown_export(f.read())
            for minutes in cuts:
                part = prefix(lines, minutes)
                name = f"{lang}-{pack}-{minutes}"
                with open(os.path.join(set_dir, f"{name}.jsonl"), "w", encoding="utf-8", newline="\n") as f:
                    for line in part:
                        f.write(json.dumps(line, ensure_ascii=False) + "\n")
                dropped = sum(1 for l in part if l["dropped"])
                untranslated = sum(1 for l in part if not l["dropped"] and l["tgt"] is None)
                print(f"| {name} | {len(part)} | {dropped} | {untranslated} |")
                bad += len(part) < 30
    if bad:
        print(f"{bad} file dưới 30 câu: thu hỏng", file=sys.stderr)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
