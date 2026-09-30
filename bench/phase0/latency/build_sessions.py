"""S6: dựng các session phát lại cho `latency-bench latency`, từ clip băng rộng của bộ A4.

Mỗi session nối các clip đã cắt bỏ im lặng hai đầu, xen giữa là khoảng lặng ngẫu nhiên 0,4–1,6 giây,
và kèm file mốc thật: thời điểm bắt đầu và dừng của từng câu (spec A2).

Mốc bắt đầu và dừng của câu là khung 32 ms đầu và cuối mà Silero VAD cho xác suất ≥ 0,5, chạy bằng onnxruntime
(bản tham chiếu độc lập với candle-onnx trong crate `pipeline`, xem `bench/phase0/vad/ref_probs.py`). Không lấy mốc
theo năng lượng: nhiều clip còn đuôi nhiễu nền ổn định (có clip tiếng Nhật nhiễu chỉ thấp hơn tiếng nói 15 dB) hoặc một
tiếng click ở khung cuối, nên mốc trễ hơn lúc người nói dừng thật tới hơn 2 giây. Khi đó câu không ghép được với đoạn
nào, hoặc ghép được nhưng độ trễ bị đo thiếu.
Mỗi clip bắt đầu ở ranh giới khung 512 mẫu của session, để VAD trong session thấy đúng các khung như lúc dựng mốc.
Vài clip quá nhỏ (RMS dưới khoảng −55 dBFS) bị VAD trong session bỏ sót dù chạy riêng thì nhận ra; câu đó hiện là
"không ghép được" khi đo.

Dùng:  uv run --no-project --python 3.12 --with "numpy==2.5.3" --with "onnxruntime==1.30.0" \
         python bench/phase0/latency/build_sessions.py [--seconds 180]
Kết quả: bench/phase0/data/latency/<tên>.wav và <tên>.truth.json, cùng sessions.json (ngôn ngữ đích).
"""
import argparse
import json
import os
import random
import wave

import numpy as np
import onnxruntime as ort

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DATA = os.path.join(ROOT, "bench", "phase0", "data")
VAD_MODEL = os.path.join(ROOT, "models", "silero_vad_v6.2.3.onnx")
# Khung VAD: 512 mẫu = 32 ms ở 16 kHz, giống crates/pipeline/src/segmenter.rs.
FRAME = 512
# Tên session -> (ngôn ngữ của các câu, ngôn ngữ đích).
SESSIONS = {
    "en": (["en"], "vi"),
    "zh": (["zh"], "vi"),
    "ja": (["ja"], "vi"),
    "ko": (["ko"], "vi"),
    "vi": (["vi"], "en"),
    "mixed": (["en", "zh", "ja", "ko"], "vi"),
}


def read(path):
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)


def trim(x, frame=320):
    """Bỏ im lặng hai đầu: khung 20 ms có RMS dưới 2% mức lớn nhất coi là im lặng."""
    n = len(x) // frame
    rms = np.sqrt((x[: n * frame].astype(np.float32).reshape(n, frame) ** 2).mean(axis=1))
    voiced = np.nonzero(rms > 0.02 * rms.max())[0]
    return x[voiced[0] * frame:(voiced[-1] + 1) * frame] if len(voiced) else x[:0]


def speech_frames(vad, x):
    """Chỉ số khung (512 mẫu) đầu và cuối mà Silero VAD cho xác suất ≥ 0,5, hoặc None nếu không có khung nào.

    Ghép 64 mẫu cuối của khung trước làm ngữ cảnh, giống OnnxWrapper của silero-vad và ref_probs.py.
    """
    audio = x.astype(np.float32) / 32768.0
    state = np.zeros((2, 1, 128), dtype=np.float32)
    context = np.zeros((1, 64), dtype=np.float32)
    sr = np.array(16000, dtype=np.int64)
    voiced = []
    for i in range(len(audio) // FRAME):
        chunk = audio[i * FRAME:(i + 1) * FRAME][None, :]
        out, state = vad.run(None, {"input": np.concatenate([context, chunk], axis=1), "state": state, "sr": sr})
        context = chunk[:, -64:]
        if float(out.reshape(-1)[0]) >= 0.5:
            voiced.append(i)
    return (voiced[0], voiced[-1]) if voiced else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=180)
    args = ap.parse_args()
    vad = ort.InferenceSession(VAD_MODEL, providers=["CPUExecutionProvider"])
    clips = [json.loads(line) for line in open(os.path.join(DATA, "asr", "manifest.jsonl"), encoding="utf-8")]
    clips = [c for c in clips if not c["narrowband"]]
    out_dir = os.path.join(DATA, "latency")
    os.makedirs(out_dir, exist_ok=True)
    index = {}
    for name, (langs, target) in SESSIONS.items():
        pool = [c for c in clips if c["lang"] in langs]
        missing = [lang for lang in langs if not any(c["lang"] == lang for c in pool)]
        if missing:
            print(f"bỏ qua session {name}: chưa có clip {missing}")
            continue
        rng = random.Random(name)
        rng.shuffle(pool)
        if len(langs) > 1:  # xen kẽ ngôn ngữ để thử nhận diện ngôn ngữ
            by_lang = {lang: [c for c in pool if c["lang"] == lang] for lang in langs}
            pool = [c for group in zip(*by_lang.values()) for c in group]
        audio, truth = [np.zeros(32 * FRAME, dtype=np.int16)], []  # 1,024 giây im lặng đầu session
        cursor = len(audio[0])
        for c in pool:
            x = trim(read(os.path.join(DATA, "asr", c["path"])))
            bounds = speech_frames(vad, x) if len(x) else None
            if bounds is None:
                continue
            first, last = bounds
            truth.append({"id": c["id"], "lang": c["lang"], "start_ms": (cursor + first * FRAME) * 1000 // 16000,
                          "end_ms": (cursor + (last + 1) * FRAME) * 1000 // 16000, "text": c["ref"]})
            pause = int(16000 * rng.uniform(0.4, 1.6))
            pause += -(cursor + len(x) + pause) % FRAME  # clip sau cũng bắt đầu ở ranh giới khung
            audio += [x, np.zeros(pause, dtype=np.int16)]
            cursor += len(x) + pause
            if cursor / 16000 >= args.seconds:
                break
        with wave.open(os.path.join(out_dir, f"{name}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(np.concatenate(audio).tobytes())
        with open(os.path.join(out_dir, f"{name}.truth.json"), "w", encoding="utf-8") as f:
            json.dump(truth, f, ensure_ascii=False, indent=1)
        # Tập ngôn ngữ nguồn luôn là mặc định của F2, để phép nhận diện ngôn ngữ giống app.
        index[name] = {"languages": "en,zh,ja,ko,vi", "target": target,
                       "utterances": len(truth), "seconds": round(cursor / 16000, 1)}
        print(name, index[name])
    with open(os.path.join(out_dir, "sessions.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1)


if __name__ == "__main__":
    main()
