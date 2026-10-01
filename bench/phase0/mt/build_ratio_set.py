"""Bộ câu để đo ngưỡng tỉ lệ token còn thiếu (Đ12 của kế hoạch Giai đoạn 1 · 00, dòng 149 của bảng đối chiếu).

- 12 chiều không có tiếng Việt (giữa en, zh, ja, ko), mỗi chiều 100 đoạn WMT24++. Dùng cùng bốn file đã ghim của
  `build_testset.py`; các đoạn khác hẳn 340 đoạn mà bộ A3 đã dùng. Câu nguồn và đích là bản dịch chuẩn của cùng một đoạn.
- Câu gốc rất ngắn (thường dưới 3 token): 12 câu đáp ngắn hay gặp trong cuộc họp cho mỗi ngôn ngữ trong năm ngôn ngữ, dịch
  sang bốn ngôn ngữ còn lại. Id bắt đầu bằng `short-`.
- Chỉ để đo tỉ lệ token, không chấm COMET, nên không cần bản tham chiếu.

Dùng: python3 bench/phase0/mt/build_ratio_set.py  (ghi bench/phase0/data/mt/testset_ratio.jsonl)
"""
import json
import os
import random
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_testset import DATA, FILES, load  # noqa: E402

N = 100
LANGS = ("en", "zh", "ja", "ko")
SHORT = {
    "en": ["Yes.", "No.", "Okay.", "Thanks.", "Right.", "Sure.", "Hello.", "Sorry?", "Great.", "Next slide.", "Agreed.", "Go ahead."],
    "vi": ["Vâng.", "Không.", "Được.", "Cảm ơn.", "Đúng rồi.", "Chắc chắn.", "Xin chào.", "Xin lỗi?", "Tuyệt.", "Trang sau.", "Đồng ý.", "Mời anh."],
    "zh": ["是的。", "不是。", "好的。", "谢谢。", "对。", "当然。", "你好。", "什么？", "太好了。", "下一页。", "同意。", "请讲。"],
    "ja": ["はい。", "いいえ。", "了解です。", "ありがとう。", "そうですね。", "もちろん。", "こんにちは。", "すみません？", "いいですね。", "次のスライド。", "賛成です。", "どうぞ。"],
    "ko": ["네.", "아니요.", "좋아요.", "감사합니다.", "맞아요.", "물론이죠.", "안녕하세요.", "네?", "훌륭해요.", "다음 슬라이드.", "동의합니다.", "말씀하세요."],
}


def main():
    data = {lang: load(lang) for lang in FILES}
    common = set.intersection(*(set(d) for d in data.values()))

    def usable(seg):
        rows = [data[lang][seg] for lang in FILES]
        if any(r["is_bad_source"] or r["domain"] == "canary" for r in rows):
            return False
        return 15 <= len(rows[0]["source"]) <= 250 and len(data["vi"][seg]["target"]) <= 300

    # Cùng pool và thứ tự xáo của build_testset.py; 340 đoạn đầu đã dùng cho A3.
    pool = sorted(s for s in common if usable(s))
    random.Random(2026).shuffle(pool)
    segments = pool[340:340 + N]

    def text(lang, seg):
        return data["vi"][seg]["source"] if lang == "en" else data[lang][seg]["target"]

    items = []
    for src in LANGS:
        for tgt in LANGS:
            if src == tgt:
                continue
            for seg in segments:
                items.append({"id": f"{src}-{tgt}-{seg}", "dir": f"{src}->{tgt}", "src_lang": src, "tgt_lang": tgt,
                              "src": text(src, seg)})
    for src, phrases in SHORT.items():
        for tgt in SHORT:
            if src == tgt:
                continue
            for k, phrase in enumerate(phrases):
                items.append({"id": f"short-{src}-{tgt}-{k}", "dir": f"{src}->{tgt}", "src_lang": src, "tgt_lang": tgt,
                              "src": phrase})
    out = os.path.join(DATA, "testset_ratio.jsonl")
    with open(out, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    print("ghi", len(items), "câu ->", out)
    print("WMT24++:", len([i for i in items if not i["id"].startswith("short-")]),
          "câu ngắn:", len([i for i in items if i["id"].startswith("short-")]))
    print(sorted(Counter(it["dir"] for it in items).items()))


if __name__ == "__main__":
    main()
