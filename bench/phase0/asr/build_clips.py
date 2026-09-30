"""Dựng bộ clip cho A4 từ FLEURS (CC BY 4.0), tập dev: mỗi ngôn ngữ ít nhất 15 phút.

- Mỗi câu của FLEURS có nhiều người đọc; lấy một bản ghi cho mỗi câu, theo thứ tự trong file TSV.
- Chọn ứng viên theo cột n_samples của TSV, bỏ clip dài hơn 30 giây (cửa sổ tối đa của Whisper).
- Sau khi có mảng mẫu 16 kHz thì kiểm lại độ dài thật: clip có số mẫu ngoài [1600, 480000] (0,1 tới 30 giây, khoảng
  `asr-worker` nhận; ngoài khoảng đó `transcribe` trả lỗi và làm hỏng cả lượt `asr-eval`) bị bỏ.
  Số clip bị bỏ được in ra.
- Cứ 4 clip lấy 1 clip làm thêm bản băng hẹp: hạ xuống 8 kHz rồi nâng lại 16 kHz,
  mô phỏng tai nghe Bluetooth ở chế độ đàm thoại (HFP).
- Clip tự thu (nếu có) khai báo trong data/asr/extra_clips.jsonl, cùng định dạng với manifest. Đường dẫn tính từ
  data/asr/. Mỗi file được đọc để đếm mẫu: không phải WAV 16 kHz mono 16-bit (như `asr-eval` đòi) hoặc có độ dài
  ngoài khoảng trên thì bị bỏ.
- FLEURS ghim theo commit, kích thước và SHA-256 của từng file; tải qua hàm của fetch.py (tải tiếp, thử lại, kiểm băm).

Dùng:  uv run --no-project --python 3.12 --with "numpy==2.5.3" --with "scipy==1.18.1" \
         python bench/phase0/asr/build_clips.py [--langs en_us,vi_vn]
Kết quả: bench/phase0/data/asr/manifest.jsonl và các file WAV 16 kHz mono trong data/asr/clips/.
"""
import argparse
import csv
import io
import json
import os
import sys
import tarfile
import wave

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from fetch import ensure  # noqa: E402  (bench/phase0/fetch.py)

DATA = os.path.abspath(os.path.join(HERE, "..", "data", "asr"))
REV = "70bb2e84b976b7e960aa89f1c648e09c59f894dd"  # commit của dataset google/fleurs
BASE = f"https://huggingface.co/datasets/google/fleurs/resolve/{REV}/data"
# (kích thước, SHA-256) của dev.tsv và của audio/dev.tar.gz cho từng ngôn ngữ, khoảng 910 MB tất cả.
PINNED = {
    "en_us": ((213065, "9d57ee7e91e9d4c92edb39f6bbea668ef8dc2a3ff96eb510d5580b2ad05d17ec"),
              (171250900, "2658fda72f199e12676ecac9415094667a4e14e149b146e568ea00b2a2f0954c")),
    "vi_vn": ((247001, "c9bc17cede9765b1c75cb7a608f7066cb6bb6f8245cc75d721a5217a5dffb414"),
              (214500592, "8821a394c99069409b3ce7bb5cd14b10b709f2ee2fea16f42b4701e1cc9ef673")),
    "cmn_hans_cn": ((205248, "6b4efd804b543048feb278db06f3b58b5ea171cdd4ba072e328ad630ca25384b"),
                    (217347747, "3bc33212d5974eef7feb04bc4792458d6cd7e14ff10a1a24772f3c45ea87a822")),
    "ja_jp": ((142341, "92beded0999347ad5b8599fe70940e2e7b9232c67c426defb258e596ade94f48"),
              (179387192, "2547f19203e1272aeba99c2235326fea525d6cfb9348bafbea2c3a7929e8e441")),
    "ko_kr": ((124920, "6b236de107c6a1672233f6d710d26adfdb55570a3e6e35aca9dc4ff2be01cea4"),
              (126162634, "496edcb5323e75b4a2830f5b5623684a0baf86d3728101853fd4fe503372157c")),
}
WHISPER_CODE = {"en_us": "en", "vi_vn": "vi", "cmn_hans_cn": "zh", "ja_jp": "ja", "ko_kr": "ko"}
MIN_SECONDS = 15 * 60
MAX_CLIP_SECONDS = 30
# Khoảng số mẫu 16 kHz mà asr-worker nhận (asr-protocol): 0,1 tới 30 giây. Ngoài khoảng này `transcribe` trả Error.
MIN_CLIP_SAMPLES = 1600
MAX_CLIP_SAMPLES = MAX_CLIP_SECONDS * 16000


def fetch(fleurs, rel, pin):
    """Tải `data/<fleurs>/<rel>` của FLEURS nếu chưa có; file đã có thì kiểm lại kích thước và SHA-256."""
    dest = os.path.join(DATA, "fleurs", fleurs, os.path.basename(rel))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    ensure(f"{BASE}/{fleurs}/{rel}", dest, *pin)
    return dest


def read_pcm16(raw):
    """FLEURS lưu WAV float32 (định dạng 3), module `wave` không đọc được nên dùng scipy."""
    rate, x = wavfile.read(io.BytesIO(raw))
    if x.ndim > 1:
        x = x.mean(axis=1)
    if x.dtype.kind == "f":
        x = x * 32767.0
    x = x.astype(np.float32)
    if rate != 16000:
        x = resample_poly(x, 16000, rate)
    return x.clip(-32768, 32767).astype(np.int16)


def write_wav(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(x.astype(np.int16).tobytes())


def narrowband(x):
    y = resample_poly(resample_poly(x.astype(np.float32), 1, 2), 2, 1)
    return y.clip(-32768, 32767).astype(np.int16)


def wav_samples(path):
    """Số mẫu của WAV tự thu. Ném ValueError nếu file không đọc được hoặc không phải 16 kHz, mono, 16-bit."""
    try:
        with wave.open(path, "rb") as w:
            fmt = (w.getframerate(), w.getnchannels(), w.getsampwidth())
            if fmt != (16000, 1, 2):
                raise ValueError(f"cần WAV 16 kHz, mono, 16-bit; file là {fmt[0]} Hz, {fmt[1]} kênh, {8 * fmt[2]}-bit")
            n = w.getnframes()
            if n <= MAX_CLIP_SAMPLES and len(w.readframes(n)) != 2 * n:  # header khai nhiều mẫu hơn số có thật
                raise ValueError("file bị cụt: thiếu dữ liệu so với header")
            return n
    except (OSError, EOFError, wave.Error) as e:
        raise ValueError(f"không đọc được WAV: {str(e) or type(e).__name__}") from e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default=",".join(WHISPER_CODE))
    args = ap.parse_args()
    rows_out = []
    for fleurs in args.langs.split(","):
        lang = WHISPER_CODE[fleurs]
        tsv_pin, tar_pin = PINNED[fleurs]
        tsv = fetch(fleurs, "dev.tsv", tsv_pin)
        tar_path = fetch(fleurs, "audio/dev.tar.gz", tar_pin)
        wanted, seen_sentences, total = {}, set(), 0.0
        with open(tsv, encoding="utf-8") as f:
            for r in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
                sentence_id, file_name, raw_text, n_samples = r[0], r[1], r[2], int(r[5])
                seconds = n_samples / 16000
                if sentence_id in seen_sentences or seconds > MAX_CLIP_SECONDS:
                    continue
                seen_sentences.add(sentence_id)
                wanted[file_name] = raw_text
                total += seconds
                if total >= MIN_SECONDS:
                    break
        kept, kept_samples, bad_length = 0, 0, 0
        with tarfile.open(tar_path) as tar:
            members = {os.path.basename(m.name): m for m in tar.getmembers() if m.isfile()}
            for file_name, text in wanted.items():
                x = read_pcm16(tar.extractfile(members[file_name]).read())
                if not MIN_CLIP_SAMPLES <= len(x) <= MAX_CLIP_SAMPLES:  # độ dài thật, không tin cột n_samples của TSV
                    print(f"  bỏ {file_name}: {len(x)} mẫu, ngoài [{MIN_CLIP_SAMPLES}, {MAX_CLIP_SAMPLES}]")
                    bad_length += 1
                    continue
                clip_id = f"{lang}-{os.path.splitext(file_name)[0]}"
                rel = os.path.join("clips", lang, clip_id + ".wav")
                write_wav(os.path.join(DATA, rel), x)
                base = {"lang": lang, "ref": text, "duration_s": round(len(x) / 16000, 2), "source": "fleurs"}
                rows_out.append({"id": clip_id, "path": rel, "narrowband": False, **base})
                if kept % 4 == 0:
                    rel_nb = os.path.join("clips", lang, clip_id + "_nb.wav")
                    write_wav(os.path.join(DATA, rel_nb), narrowband(x))
                    rows_out.append({"id": clip_id + "_nb", "path": rel_nb, "narrowband": True, **base})
                kept += 1
                kept_samples += len(x)
        print(f"{fleurs}: {kept} clip, {kept_samples / 16000 / 60:.1f} phút, bỏ {bad_length} clip vì độ dài")
        if kept_samples < MIN_SECONDS * 16000:
            print(f"CẢNH BÁO: {fleurs} chỉ còn {kept_samples / 16000 / 60:.1f} phút, thiếu so với "
                  f"{MIN_SECONDS // 60} phút của A4", file=sys.stderr)
    extra = os.path.join(DATA, "extra_clips.jsonl")
    if os.path.exists(extra):
        kept, bad_length, bad_format = 0, 0, 0
        with open(extra, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                row = json.loads(line)
                try:
                    if "path" not in row:
                        raise ValueError("thiếu trường path")
                    n = wav_samples(os.path.join(DATA, row["path"]))
                except ValueError as e:
                    print(f"  bỏ clip tự thu {row.get('id', '?')}: {e}")
                    bad_format += 1
                    continue
                if not MIN_CLIP_SAMPLES <= n <= MAX_CLIP_SAMPLES:
                    print(f"  bỏ clip tự thu {row.get('id', '?')}: {n} mẫu, ngoài "
                          f"[{MIN_CLIP_SAMPLES}, {MAX_CLIP_SAMPLES}]")
                    bad_length += 1
                    continue
                rows_out.append(row)
                kept += 1
        print(f"clip tự thu: {kept} clip, bỏ {bad_length} clip vì độ dài, bỏ {bad_format} clip vì sai định dạng")
    with open(os.path.join(DATA, "manifest.jsonl"), "w", encoding="utf-8") as f:
        for r in rows_out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print("manifest:", len(rows_out), "dòng ->", os.path.join(DATA, "manifest.jsonl"))


if __name__ == "__main__":
    main()
