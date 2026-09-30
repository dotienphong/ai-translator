"""S6: dựng các session phát lại cho `latency-bench latency`, từ clip băng rộng của bộ A4.

Mỗi session nối các clip đã cắt quanh vùng tiếng nói, xen giữa là số 0 để khoảng lặng thật (từ lúc hết tiếng câu trước tới
lúc câu sau bắt đầu nói) ngẫu nhiên trong 0,4–1,6 giây, và kèm file mốc thật: thời điểm bắt đầu và dừng của từng câu (A2).

Vùng tiếng nói, tức mốc bắt đầu và dừng của câu, lấy từ Silero VAD chạy bằng onnxruntime (bản tham chiếu độc lập với
candle-onnx trong crate `pipeline`, xem `bench/phase0/vad/ref_probs.py`): khung 32 ms đầu và cuối có xác suất ≥ 0,5. Không
lấy mốc theo năng lượng: nhiều clip còn đuôi nhiễu nền ổn định (có clip tiếng Nhật nhiễu chỉ thấp hơn tiếng nói 15 dB) hoặc
một tiếng click ở khung cuối, nên mốc trễ hơn lúc người nói dừng thật tới hơn 2 giây.

- Mức: tiếng nói (RMS trên vùng VAD) được chuẩn hóa về −26 dBFS, đỉnh không quá 0,89. Bộ A4 có clip từ −66 đến −15 dBFS; clip
  dưới khoảng −60 dBFS bị VAD bỏ sót trong session (sau tiếng to và im lặng số), còn âm thanh cuộc họp đã qua AGC của app họp
  thường ở −20 đến −30 dBFS.
- Cắt: mỗi clip giữ lề 3 khung (96 ms) trước và 6 khung (192 ms) sau vùng VAD, đủ để không cắt phần âm cuối yếu mà VAD cho dưới
  0,5, mà vẫn nhỏ hơn khoảng lặng ngắn nhất.
- Mốc tính trên đúng clip đưa vào session (khuếch đại và cắt đổi xác suất VAD của vài khung đầu). Mỗi clip bắt đầu ở ranh
  giới khung 512 mẫu của session, để VAD trong session thấy đúng các khung như lúc dựng mốc.
- Mốc dừng: VAD trễ hơn lúc hết tiếng thật khoảng 40–100 ms (đuôi nhớ của mô hình). Với clip có SNR ≥ 30 dB, `end_ms` được
  tinh chỉnh về khung 10 ms cuối cùng còn trên ngưỡng (mức tiếng nói − 30 dB) trong 320 ms cuối của vùng VAD; `vad_end_ms` giữ
  mốc VAD để tham khảo. Clip SNR thấp hơn thì `end_ms` = `vad_end_ms`, nên độ trễ của chúng bị đo thiếu cỡ 40–100 ms.
- Còn vài clip quá nhỏ hoặc quá nhiễu mà VAD trong session vẫn bỏ sót: câu đó hiện là "không ghép được" khi đo.

Dùng:  uv run --no-project --python 3.12 --with "numpy==2.5.3" --with "onnxruntime==1.30.0" \
         python bench/phase0/latency/build_sessions.py [--seconds 180]
Kết quả: bench/phase0/data/latency/<tên>.wav và <tên>.truth.json, cùng sessions.json (ngôn ngữ đích).
"""
import argparse
import json
import os
import random
import statistics
import wave

import numpy as np
import onnxruntime as ort

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DATA = os.path.join(ROOT, "bench", "phase0", "data")
VAD_MODEL = os.path.join(ROOT, "models", "silero_vad_v6.2.3.onnx")
SR = 16000
# Khung VAD: 512 mẫu = 32 ms, giống crates/pipeline/src/segmenter.rs.
FRAME = 512
TARGET_DBFS = -26.0
PEAK_MAX = 0.89  # khoảng −1 dBFS, để khuếch đại không làm tràn int16
HEAD_FRAMES, TAIL_FRAMES = 3, 6
# Tinh chỉnh mốc dừng: cửa sổ Hann 25 ms, bước 10 ms, dải 200–4000 Hz (bỏ ù tần thấp).
WIN, HOP = 400, 160
SNR_MIN_DB = 30  # chỉ tinh chỉnh khi tiếng nói cao hơn nền nhiễu từng này dB
REFINE_REL_DB = 30  # ngưỡng = mức tiếng nói − 30 dB
REFINE_WINDOW_MS = 320  # chỉ tìm trong từng này ms cuối của vùng VAD
RUN = 3  # một khung trên ngưỡng phải nằm trong dãy ít nhất 3 khung liền (30 ms), để bỏ tiếng click
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
        if (w.getframerate(), w.getnchannels(), w.getsampwidth()) != (SR, 1, 2):
            raise SystemExit(f"{path} phải là WAV 16 kHz, mono, 16-bit")
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
    sr = np.array(SR, dtype=np.int64)
    voiced = []
    for i in range(len(audio) // FRAME):
        chunk = audio[i * FRAME:(i + 1) * FRAME][None, :]
        out, state = vad.run(None, {"input": np.concatenate([context, chunk], axis=1), "state": state, "sr": sr})
        context = chunk[:, -64:]
        if float(out.reshape(-1)[0]) >= 0.5:
            voiced.append(i)
    return (voiced[0], voiced[-1]) if voiced else None


def band_db(x):
    """Năng lượng (dB) của từng khung 10 ms (cửa sổ 25 ms) trong dải 200–4000 Hz; `x` là float trong [−1, 1]."""
    n = (len(x) - WIN) // HOP + 1
    if n <= 0:
        return np.zeros(0)
    idx = np.arange(WIN)[None, :] + HOP * np.arange(n)[:, None]
    spec = np.abs(np.fft.rfft(x[idx] * np.hanning(WIN)[None, :], axis=1)) ** 2
    freq = np.fft.rfftfreq(WIN, 1 / SR)
    return 10 * np.log10(spec[:, (freq >= 200) & (freq <= 4000)].sum(axis=1) + 1e-12)


def refine_end(x, bounds):
    """Mốc hết tiếng tinh chỉnh (số mẫu từ đầu `x`) và SNR (dB) của clip, hoặc (None, SNR) nếu không tinh chỉnh.

    `bounds` là (khung đầu, khung cuối) của VAD trên `x`. Nền nhiễu là phân vị 20 của các khung ngoài vùng VAD, mức tiếng nói
    là phân vị 90 của các khung trong vùng VAD. Mốc là khung cuối của một dãy ≥ 3 khung liền trên ngưỡng, tìm trong 320 ms
    cuối của vùng VAD nên không bao giờ muộn hơn mốc VAD.
    """
    db = band_db(x.astype(np.float32) / 32768.0)
    centre = np.arange(len(db)) * HOP + WIN // 2  # tâm khung, tính bằng mẫu
    v_start, v_end = bounds[0] * FRAME, (bounds[1] + 1) * FRAME
    inside = (centre >= v_start) & (centre <= v_end)
    if inside.sum() < 10 or (~inside).sum() < 10:
        return None, None
    speech, noise = np.percentile(db[inside], 90), np.percentile(db[~inside], 20)
    snr = float(speech - noise)
    if snr < SNR_MIN_DB:
        return None, snr
    above = db > speech - REFINE_REL_DB
    window_start = v_end - REFINE_WINDOW_MS * SR // 1000
    ends = [i + RUN - 1 for i in range(len(db) - RUN + 1)
            if above[i:i + RUN].all() and window_start <= centre[i + RUN - 1] <= v_end]
    if not ends:
        return None, snr
    return min(int(centre[ends[-1]] + HOP // 2), v_end), snr


def prepare(vad, x):
    """Chuẩn hóa mức rồi cắt clip quanh vùng tiếng nói. Trả (clip int16, khung đầu, khung cuối, mốc hết tiếng tinh chỉnh
    (số mẫu từ đầu clip) hoặc None, SNR hoặc None), hoặc None nếu VAD không thấy tiếng nói.

    Mốc được tính lại trên đúng clip cuối cùng, vì cả khuếch đại lẫn việc cắt đầu đều đổi xác suất VAD của vài khung đầu.
    Độ dài clip là bội số của FRAME, để clip sau vẫn bắt đầu ở ranh giới khung.
    """
    bounds = speech_frames(vad, x) if len(x) else None
    if bounds is None:
        return None
    speech = x[bounds[0] * FRAME:(bounds[1] + 1) * FRAME].astype(np.float32) / 32768.0
    rms = float(np.sqrt((speech ** 2).mean()))
    peak = float(np.abs(x.astype(np.float32)).max()) / 32768.0
    gain = min(10 ** (TARGET_DBFS / 20) / max(rms, 1e-6), PEAK_MAX / max(peak, 1e-6))
    x = np.clip(np.round(x.astype(np.float32) * gain), -32768, 32767).astype(np.int16)
    bounds = speech_frames(vad, x)
    if bounds is None:
        return None
    refined, snr = refine_end(x, bounds)  # trên clip chưa cắt: còn đủ đầu và đuôi để ước lượng nền nhiễu
    lo = max(0, bounds[0] - HEAD_FRAMES) * FRAME
    hi = min(len(x) // FRAME, bounds[1] + 1 + TAIL_FRAMES) * FRAME
    clip = x[lo:hi]
    bounds = speech_frames(vad, clip)
    if bounds is None:
        return None
    return clip, bounds[0], bounds[1], (refined - lo if refined is not None else None), snr


def prepared_clips(vad, pool):
    """Chuẩn bị lần lượt các clip trong `pool` (chỉ khi cần), bỏ clip mà VAD không thấy tiếng nói."""
    for c in pool:
        p = prepare(vad, trim(read(os.path.join(DATA, "asr", c["path"]))))
        if p is not None:
            yield (c, *p)


def assemble(clips, rng, seconds):
    """Ghép các clip đã chuẩn bị tới khi đủ `seconds`. Khoảng lặng giữa hai câu (hết tiếng câu trước → câu sau bắt đầu
    nói) ~ U(0,4; 1,6) giây: số 0 chèn thêm = khoảng đó trừ đuôi clip trước và đầu clip sau."""
    audio, truth = [np.zeros(32 * FRAME, dtype=np.int16)], []  # 1,024 giây im lặng đầu session
    cursor, prev_tail = len(audio[0]), None
    for c, x, first, last, refined, snr in clips:
        if prev_tail is not None:
            gap = rng.uniform(0.4, 1.6) * SR
            zeros = max(0, round((gap - prev_tail - first * FRAME) / FRAME)) * FRAME
            audio.append(np.zeros(zeros, dtype=np.int16))
            cursor += zeros
        vad_end = cursor + (last + 1) * FRAME
        truth.append({"id": c["id"], "lang": c["lang"], "start_ms": (cursor + first * FRAME) * 1000 // SR,
                      "end_ms": (cursor + refined) * 1000 // SR if refined is not None else vad_end * 1000 // SR,
                      "vad_end_ms": vad_end * 1000 // SR,
                      "snr_db": None if snr is None else round(snr, 1), "text": c["ref"]})
        audio.append(x)
        cursor += len(x)
        prev_tail = len(x) - (last + 1) * FRAME
        if cursor / SR >= seconds:
            break
    audio.append(np.zeros(32 * FRAME, dtype=np.int16))  # 1,024 giây im lặng cuối: đoạn cuối được chốt như các đoạn khác
    cursor += 32 * FRAME
    return np.concatenate(audio), truth, cursor


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=180)
    args = ap.parse_args()
    vad = ort.InferenceSession(VAD_MODEL, providers=["CPUExecutionProvider"])
    clips = [json.loads(line) for line in open(os.path.join(DATA, "asr", "manifest.jsonl"), encoding="utf-8")]
    clips = [c for c in clips if not c["narrowband"]]
    out_dir = os.path.join(DATA, "latency")
    os.makedirs(out_dir, exist_ok=True)
    index, shifts = {}, []
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
        audio, truth, cursor = assemble(prepared_clips(vad, pool), rng, args.seconds)
        with wave.open(os.path.join(out_dir, f"{name}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(audio.tobytes())
        with open(os.path.join(out_dir, f"{name}.truth.json"), "w", encoding="utf-8") as f:
            json.dump(truth, f, ensure_ascii=False, indent=1)
        # Tập ngôn ngữ nguồn luôn là mặc định của F2, để phép nhận diện ngôn ngữ giống app.
        index[name] = {"languages": "en,zh,ja,ko,vi", "target": target,
                       "utterances": len(truth), "seconds": round(cursor / SR, 1)}
        gaps = [(b["start_ms"] - a["vad_end_ms"]) / 1000 for a, b in zip(truth, truth[1:])]
        density = sum(u["vad_end_ms"] - u["start_ms"] for u in truth) / 1000 / (cursor / SR)
        shifts += [u["vad_end_ms"] - u["end_ms"] for u in truth if u["snr_db"] is not None and u["snr_db"] >= SNR_MIN_DB]
        spread = (f"{min(gaps):.2f}/{statistics.median(gaps):.2f}/{max(gaps):.2f} s (nhỏ nhất/trung vị/lớn nhất)"
                  if gaps else "chưa có")
        print(name, index[name], f"khoảng lặng thật {spread}, tiếng nói chiếm {density:.0%}")
    with open(os.path.join(out_dir, "sessions.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1)
    total = sum(v["utterances"] for v in index.values())
    if shifts:
        print(f"tinh chỉnh mốc dừng (SNR ≥ {SNR_MIN_DB} dB): {sum(s > 0 for s in shifts)}/{total} câu được dời sớm lại, "
              f"{sum(s == 0 for s in shifts)} câu giữ mốc VAD; độ dời trung vị {statistics.median(shifts):.0f} ms "
              f"(nhỏ nhất {min(shifts)}, lớn nhất {max(shifts)} ms)")


if __name__ == "__main__":
    main()
