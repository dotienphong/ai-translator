"""Build the test set from WMT24++ (google/wmt24pp, Apache-2.0).

WMT24++ is multi-way parallel: every file translates the same English segments, so
segment i gives us en/vi/zh/ja/ko versions of one sentence. That lets us build
vi->en, vi->zh, vi->ja and vi->ko pairs from the Vietnamese reference.
"""
import json
import os
import random
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://huggingface.co/datasets/google/wmt24pp/resolve/main/"
FILES = {"vi": "en-vi_VN", "zh": "en-zh_CN", "ja": "en-ja_JP", "ko": "en-ko_KR"}

N_EN_VI = 100
N_VI_EN = 100
N_VI_CJK = 40  # same 40 segments for vi->zh, vi->ja, vi->ko

# Everyday Vietnamese utterances (no reference) for side-by-side reading.
QUALITATIVE = [
    "Em ơi, cho anh xin hai ly cà phê sữa đá, ít đường nhé.",
    "Cho mình hỏi đường ra ga tàu gần nhất đi hướng nào vậy?",
    "Phòng này có máy lạnh không, và giá một đêm là bao nhiêu?",
    "Tôi bị dị ứng với đậu phộng, món này có đậu phộng không?",
    "Chuyến bay của tôi bị hoãn ba tiếng, tôi có được bồi thường không?",
    "Anh đi thẳng khoảng 200 mét rồi rẽ trái ở ngã tư thứ hai là tới.",
    "Hôm nay kẹt xe quá, chắc tôi đến trễ khoảng mười lăm phút.",
    "Bác sĩ ơi, tôi bị sốt từ tối qua và đau họng dữ lắm.",
    "Cái áo này có size lớn hơn không? Bớt chút được không chị?",
    "Mưa to quá, ướt như chuột lột luôn.",
    "Tui hổng biết nữa, để tui hỏi lại sếp rồi báo bạn sau.",
    "Cảm ơn bạn nhiều nha, hẹn gặp lại lần sau!",
]


def load(lang):
    path = os.path.join(HERE, FILES[lang] + ".jsonl")
    if not os.path.exists(path):
        urllib.request.urlretrieve(BASE + FILES[lang] + ".jsonl", path)
    with open(path, encoding="utf-8") as f:
        return {r["segment_id"]: r for r in map(json.loads, f)}


def main():
    data = {lang: load(lang) for lang in FILES}
    common = set.intersection(*(set(d) for d in data.values()))

    def usable(seg):
        rows = [data[lang][seg] for lang in FILES]
        if any(r["is_bad_source"] or r["domain"] == "canary" for r in rows):
            return False
        # Keep utterance-sized segments, closer to what the app translates.
        return 15 <= len(rows[0]["source"]) <= 250 and len(data["vi"][seg]["target"]) <= 300

    pool = sorted(s for s in common if usable(s))
    rng = random.Random(2026)
    rng.shuffle(pool)
    en_vi = pool[:N_EN_VI]
    vi_en = pool[N_EN_VI:N_EN_VI + N_VI_EN]
    vi_cjk = pool[N_EN_VI + N_VI_EN:N_EN_VI + N_VI_EN + N_VI_CJK]

    items = []

    def add(seg, src_lang, tgt_lang):
        vi = data["vi"][seg]
        src = vi["source"] if src_lang == "en" else vi["target"]
        ref = vi["source"] if tgt_lang == "en" else data[tgt_lang][seg]["target"]
        items.append({
            "id": f"{src_lang}-{tgt_lang}-{seg}",
            "dir": f"{src_lang}->{tgt_lang}",
            "src_lang": src_lang,
            "tgt_lang": tgt_lang,
            "domain": vi["domain"],
            "src": src,
            "ref": ref,
        })

    for seg in en_vi:
        add(seg, "en", "vi")
    for seg in vi_en:
        add(seg, "vi", "en")
    for tgt in ("zh", "ja", "ko"):
        for seg in vi_cjk:
            add(seg, "vi", tgt)
    for i, text in enumerate(QUALITATIVE, 1):
        items.append({"id": f"q{i:02d}", "dir": "vi->en (qual)", "src_lang": "vi", "tgt_lang": "en",
                      "domain": "everyday", "src": text, "ref": ""})

    out = os.path.join(HERE, "testset.jsonl")
    with open(out, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")

    from collections import Counter
    print("pool:", len(pool), "| written:", len(items), "->", out)
    print(Counter(it["dir"] for it in items))
    print(Counter(it["domain"] for it in items if it["ref"]))


if __name__ == "__main__":
    main()
