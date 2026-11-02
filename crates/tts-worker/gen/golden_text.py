"""Sinh golden cho frames/text/speech từ SDK `vieneu` (không cần model). Cần `pip install vieneu`.
Chạy từ gốc repo: python crates/tts-worker/gen/golden_text.py"""
import json
import numpy as np
from vieneu_utils.phonemize_text import phonemize_text_with_emotions
from vieneu_utils import core_utils as cu

texts = [
    "Xin chào.", "Vâng.", "Được không?", "Xin chào, đây là bản thử giọng đọc tiếng Việt cho ứng dụng AI Translator.",
    "Hello, this is a quick test of the English voice for the translator.",
    "Cuộc họp sẽ bắt đầu lúc 3 giờ chiều, vui lòng join qua Microsoft Teams.",
    "Giá là 3,5 triệu đồng, tăng 12% so với tháng trước.", "Notification", "Okay", "Computer",
    "[cười]", "Haha [cười] vui quá", "Thật là [thở dài] mệt mỏi.", "[hắng giọng] Xin phép phát biểu.",
    "Hôm nay trời đẹp quá!", "Anh có khỏe không?", "Dạ", "Một hai ba bốn năm sáu bảy tám chín mười.",
    "Please review the document before Friday's meeting, thanks.", "Bạn ơi, chờ mình một chút nhé.",
    "", "   ",
]
frames = []
for t in texts:
    ph = phonemize_text_with_emotions(t) if t.strip() else ""
    frames.append(dict(phonemes=ph, syl=cu.syllable_count(ph), cue=bool(cu.is_cue_only(ph)), cap=int(cu.max_expected_frames(ph))))
for ph in ["<|emotion_1|>", "ˈa", "ˈa ˈa", "kɹiːˈeɪt", "ɹˈeɪdɪˌoʊ", "kəmpjˈuːɾɚ", "kwˈaːɜ", "x" * 80, "ab " * 60, "<en>sˈækaɪ</en> bˈaː4n"]:
    frames.append(dict(phonemes=ph, syl=cu.syllable_count(ph), cue=bool(cu.is_cue_only(ph)), cap=int(cu.max_expected_frames(ph))))

sents = [
    "Xin chào. Tôi là A! Giá 3.5 triệu?", "Anh hỏi: \"Rồi sao? Đến bao giờ?\", đúng không?", "Một \"câu lệch. Câu hai. Câu ba.",
    "Hết rồi... Thật chứ?! Vâng.", "Họp lúc 8.30 sáng. Nhớ nhé!", "(Xem phụ lục. Mục 3.) Sau đó thì sao?", "Không dấu câu cuối",
    "“Xin chào. Bạn khỏe không?” Tôi hỏi.", "A.B.C. là gì? OK.", "   ", "", "Câu một.\nCâu hai.\n\nCâu ba!",
]
sentences = [dict(text=t, out=cu.split_into_sentences(t)) for t in sents]

M = 1 << 32
def lcg_wave(seed, n, segs):
    """Sóng giả xác định: segs = [(a, b, biên_độ)], còn lại im (nhiễu rất nhỏ). Dùng LCG số nguyên để Rust tái tạo y hệt."""
    x = seed
    out = np.zeros(n, dtype=np.float32)
    for i in range(n):
        x = (x * 1664525 + 1013904223) % M
        out[i] = np.float32(((x >> 8) & 0xFFFF) / 32768.0 - 1.0)
    amp = np.full(n, 0.0004, dtype=np.float32)
    for a, b, g in segs:
        amp[a:b] = np.float32(g)
    return (out * amp).astype(np.float32)

waves = []
specs = [
    (1, 48000, [(2000, 8000, 0.4), (20000, 26000, 0.4), (36000, 42000, 0.4)]),
    (2, 48000, [(10000, 20000, 0.5)]),
    (3, 24000, [(0, 24000, 0.3)]),
    (4, 9000, []),
    (5, 48000, [(4800, 5000, 0.9), (30000, 30400, 0.9), (30600, 31000, 0.9)]),
    (6, 100, [(0, 100, 0.5)]),
    (7, 60000, [(1000, 9000, 0.2), (9400, 12000, 0.35), (40000, 52000, 0.15)]),
]
for seed, n, segs in specs:
    w = lcg_wave(seed, n, segs)
    lead, tail = cu.edge_silence(w, 48000)
    waves.append(dict(seed=seed, n=n, segs=segs, lead=int(lead), tail=int(tail), bursts=int(cu.count_speech_bursts(w, 48000))))
pads = []
for i in range(len(specs)):
    for j in range(len(specs)):
        a, b = lcg_wave(*specs[i]), lcg_wave(*specs[j])
        pads.append(dict(i=i, j=j, pause=0.5, pad=int(cu.pause_pad_samples(a, b, 48000, 0.5))))
babble = []
for k, ph in enumerate(["ˈa", "ˈa ˈa", "ˈa ˈa ˈa", "ˈa ˈa ˈa ˈa", "<|emotion_1|>", "", "sˈin"]):
    for wi, (seed, n, segs) in enumerate(specs):
        w = lcg_wave(seed, n, segs)
        for cap, nf in [(13, None), (13, 12), (13, 3), (40, 38)]:
            r = cu.babble_suspect(w, 48000, ph, cap, nf)
            babble.append(dict(ph=ph, wi=wi, cap=cap, nf=nf, suspect=bool(r[0]), syl=int(r[1]), bursts=int(r[2]), n_frames=int(r[3])))
json.dump(dict(frames=frames, sentences=sentences, specs=specs, waves=waves, pads=pads, babble=babble),
          open("crates/tts-worker/tests/golden_text.json", "w"), ensure_ascii=False)
print(len(frames), len(sentences), len(waves), len(pads), len(babble))
