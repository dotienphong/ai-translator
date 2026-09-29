"""Dựng bộ test cho A3 ở S7: bộ benchmark 2026-09-29 + Trung/Nhật/Hàn→Việt (mỗi chiều 100 câu mới).

- Bộ cũ: giữ nguyên 320 câu có bản tham chiếu (Anh→Việt 100, Việt→Anh 100, Việt→Trung/Nhật/Hàn mỗi chiều 40),
  để so được với mốc cũ. Bỏ 12 câu đời thường không có bản tham chiếu, vì COMET cần bản tham chiếu.
- Trung/Nhật/Hàn→Việt: 100 đoạn WMT24++ khác hẳn 240 đoạn benchmark cũ đã dùng; câu nguồn là bản dịch
  chuẩn tiếng Trung/Nhật/Hàn, bản tham chiếu là bản dịch chuẩn tiếng Việt của cùng đoạn.
- Trường `context`: câu liền trước trong cùng tài liệu, bằng ngôn ngữ nguồn, cho thí nghiệm cờ ngữ cảnh (§6.5).

Dùng: python3 bench/phase0/mt/build_testset.py
"""
import hashlib
import json
import os
import random
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OLD = os.path.join(ROOT, "bench", "2026-09-29-mt-benchmark")
DATA = os.path.join(ROOT, "bench", "phase0", "data", "mt")
# Commit của dataset google/wmt24pp (2026-07-30), cùng bản mà benchmark 2026-09-29 đã dùng.
REV = "fd7405c06494bc66a57b25f55d217a72f96e60dc"
BASE = f"https://huggingface.co/datasets/google/wmt24pp/resolve/{REV}/"
FILES = {"vi": "en-vi_VN", "zh": "en-zh_CN", "ja": "en-ja_JP", "ko": "en-ko_KR"}
# SHA-256 của từng file, để bộ test dựng lại giống hệt ở mọi máy.
SHA256 = {
    "en-vi_VN": "9fa4c9d7fdea02ee03f3ea744b6f6ea5924d9d89337877cf8bacf148f81e3119",
    "en-zh_CN": "984ec4da714800aae2b9ee6e2601d1cadb01a770e01ed385d5283ce7a0585287",
    "en-ja_JP": "58bbee69aed537d21e25f04c5eaf49c2c7aef1b1dddb918f6eac424ab93c7ec8",
    "en-ko_KR": "4520124f3769cd711aab0c939aeb849a225dce51b761eeb419f46e555b02d7e5",
}
N_NEW = 100


def load(lang):
    os.makedirs(DATA, exist_ok=True)
    name = FILES[lang]
    path = os.path.join(DATA, name + ".jsonl")
    if not os.path.exists(path):
        req = urllib.request.Request(BASE + name + ".jsonl", headers={"User-Agent": "meeting-translator-phase0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
        if hashlib.sha256(raw).hexdigest() != SHA256[name]:
            raise SystemExit(f"{name}.jsonl: SHA-256 không khớp bản đã ghim (có thể do rớt mạng); chạy lại")
        with open(path + ".part", "wb") as f:
            f.write(raw)
        os.replace(path + ".part", path)
    elif hashlib.sha256(open(path, "rb").read()).hexdigest() != SHA256[name]:
        raise SystemExit(f"{path}: khác bản đã ghim; xóa file rồi chạy lại")
    with open(path, encoding="utf-8") as f:
        return {r["segment_id"]: r for r in map(json.loads, f)}


def main():
    data = {lang: load(lang) for lang in FILES}
    # Dựng lại đúng pool và thứ tự xáo của prep_data.py (2026-09-29) để không trùng 240 đoạn đã dùng.
    common = set.intersection(*(set(d) for d in data.values()))

    def usable(seg):
        rows = [data[lang][seg] for lang in FILES]
        if any(r["is_bad_source"] or r["domain"] == "canary" for r in rows):
            return False
        return 15 <= len(rows[0]["source"]) <= 250 and len(data["vi"][seg]["target"]) <= 300

    pool = sorted(s for s in common if usable(s))
    random.Random(2026).shuffle(pool)
    new_segments = pool[240:240 + N_NEW]

    def previous(lang, seg, field):
        """Câu liền trước trong cùng tài liệu, hoặc chuỗi rỗng."""
        row = data[lang][seg]
        prev = data[lang].get(seg - 1)
        if prev and prev["document_id"] == row["document_id"] and not prev["is_bad_source"]:
            return prev[field]
        return ""

    items = []
    with open(os.path.join(OLD, "testset.jsonl"), encoding="utf-8") as f:
        for it in map(json.loads, f):
            if not it["ref"]:
                continue
            seg = int(it["id"].split("-")[-1])  # segment_id của WMT24++ là số nguyên
            # File en-vi_VN: `source` là câu tiếng Anh, `target` là câu tiếng Việt.
            field = "source" if it["src_lang"] == "en" else "target"
            items.append({**it, "context": previous("vi", seg, field)})
    for src in ("zh", "ja", "ko"):
        for seg in new_segments:
            items.append({
                "id": f"{src}-vi-{seg}",
                "dir": f"{src}->vi",
                "src_lang": src,
                "tgt_lang": "vi",
                "domain": data["vi"][seg]["domain"],
                "src": data[src][seg]["target"],
                "ref": data["vi"][seg]["target"],
                "context": previous(src, seg, "target"),
            })
    out = os.path.join(DATA, "testset_phase0.jsonl")
    with open(out, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    from collections import Counter
    print("ghi", len(items), "câu ->", out)
    print(Counter(it["dir"] for it in items))
    print("có ngữ cảnh:", Counter(it["dir"] for it in items if it["context"]))


if __name__ == "__main__":
    main()
