"""Sinh dữ liệu đối chiếu cho tests/engine_ref.rs từ SDK `vieneu` (greedy, xác định). Cần `pip install vieneu`.

Đặt R (thư mục model: <R>/vieneu-v3-turbo/onnx_update và <R>/moss-codec) và đường dẫn ra ở đầu file cho đúng máy.
QUAN TRỌNG: chạy với CÙNG phiên bản ONNX Runtime mà engine Rust nạp (ví dụ onnxruntime==1.31.0). Hai bản ORT khác nhau cho
khác biệt số học nhỏ, đủ lật vài lựa chọn greedy gần hòa (đã đo: ORT 1.29 và 1.31 lệch 4/49 khung).
Sau đó chuyển mảng sang float32 (np.savez ... astype(np.float32)) thành ref_f32.npz vì bộ đọc npz chỉ nhận <f4/<f8.
"""
import json, numpy as np, onnx
from vieneu._v3_turbo_engine.onnx_runtime_lite import OnnxV3LiteEngine
from vieneu_utils.phonemize_text import phonemize_text_with_emotions
R = "/mnt/user-data/uploads/ai-translator/models/tts"
for f in ["onnx_update/vieneu_prefill","onnx_update/vieneu_decode_step","onnx_update/vieneu_acoustic_cached"]:
    m = onnx.load(f"{R}/vieneu-v3-turbo/{f}.onnx", load_external_data=False)
    ins=[(i.name,[d.dim_value or d.dim_param for d in i.type.tensor_type.shape.dim], i.type.tensor_type.elem_type) for i in m.graph.input]
    outs=[(o.name,[d.dim_value or d.dim_param for d in o.type.tensor_type.shape.dim]) for o in m.graph.output]
    print(f, "IN", ins[:6], "...", len(ins), "OUT", outs[:3], "...", len(outs))
m = onnx.load(f"{R}/moss-codec/moss_audio_tokenizer_decode_full.onnx", load_external_data=False)
print("codec IN", [(i.name,[d.dim_value or d.dim_param for d in i.type.tensor_type.shape.dim], i.type.tensor_type.elem_type) for i in m.graph.input], "OUT", [(o.name,[d.dim_value or d.dim_param for d in o.type.tensor_type.shape.dim]) for o in m.graph.output])

eng = OnnxV3LiteEngine(onnx_dir=f"{R}/vieneu-v3-turbo/onnx_update", codec_dir=f"{R}/moss-codec", threads=0)
voices = json.load(open("/usr/local/lib/python3.13/site-packages/vieneu/assets/voices_v3_turbo.json"))
v = voices["presets"][voices["default_voice"]]
spk = np.asarray(v["speaker_emb"], dtype=np.float32); codes = np.asarray(v["codes"], dtype=np.int64)
text = "Xin chào, đây là bản thử giọng đọc tiếng Việt cho ứng dụng AI Translator."
ph = phonemize_text_with_emotions(text)
anchor = eng._speaker_anchor(spk)
rows = eng._build_rows(ph, codes, eng._resolve_style_id())
emb = eng._embed_rows(rows, anchor)
saved = {}
orig = eng._decode_codes
def cap(c):
    saved["codes"] = np.asarray(c); w = orig(c); saved["wav"] = w; return w
eng._decode_codes = cap
eng.babble_retries = 0
wav = eng.infer(phonemes=ph, speaker_emb=spk, ref_codes=codes, temperature=0.0, repetition_penalty=1.2, repetition_window=64, frame_cap=False, max_new_frames=300)
np.savez("/home/claude/ref/dump.npz", rows=rows, anchor=anchor, emb=emb, codes=saved["codes"], wav=saved["wav"], spk=spk, refcodes=codes)
json.dump(dict(text=text, phonemes=ph), open("/home/claude/ref/dump.json","w"), ensure_ascii=False)
print("rows", rows.shape, "emb", emb.shape, "frames", saved["codes"].shape, "wav", saved["wav"].shape, "ph:", ph)
