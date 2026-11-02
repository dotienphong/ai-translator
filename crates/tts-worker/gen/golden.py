"""Sinh golden test cho lõi lấy mẫu từ SDK vieneu (bản tham chiếu), không cần model."""
import json
import numpy as np
from vieneu._v3_turbo_engine import onnx_runtime_lite as m
from vieneu._v3_turbo_engine.rep_history import RepetitionHistory

rng = np.random.default_rng(1234)
recorded = {}
def fake_choice(n, p=None):
    recorded["p"] = np.asarray(p, dtype=np.float64)
    return recorded["pick"]
m.np.random.choice = fake_choice  # chặn lấy mẫu ngẫu nhiên, ghi lại phân phối
sample = m.OnnxV3LiteEngine._sample

cases = []
param_grid = [
    (0.0, 50, 1.0, 1.0), (0.8, 50, 1.0, 1.0), (0.8, 50, 0.9, 1.0), (1.0, 0, 1.0, 1.0),
    (0.8, 20, 0.95, 1.1), (0.5, 8, 0.8, 1.3), (1.2, 1024, 0.7, 1.05), (0.8, 1, 1.0, 1.0),
    (-1.0, 50, 1.0, 1.2),
]
for V in (64, 1024):
    for (t, k, p, r) in param_grid:
        for rep in range(2):
            logits = (rng.standard_normal(V) * 3).astype(np.float32)  # phân biệt, không trùng giá trị
            prev = sorted(set(rng.integers(0, V, size=rng.integers(0, 12)).tolist())) if rep else []
            # id ứng viên theo thứ tự: chạy với từng chỉ số pick
            recorded["pick"] = 0
            first = sample(None, logits, t, k, p, r, set(prev))
            if not (t and t > 0):
                cases.append(dict(logits=logits.tolist(), temperature=t, top_k=k, top_p=p, rep_pen=r,
                                  prev=prev, greedy=int(first)))
                continue
            probs = recorded["p"].tolist()
            ids = [int(first)]
            for i in range(1, len(probs)):
                recorded["pick"] = i
                ids.append(int(sample(None, logits, t, k, p, r, set(prev))))
            cases.append(dict(logits=logits.tolist(), temperature=t, top_k=k, top_p=p, rep_pen=r,
                              prev=prev, ids=ids, probs=probs))

# cửa sổ phạt lặp: dãy mã ngẫu nhiên, ghi tập khóa sau mỗi lần add
hist_cases = []
for window in (0, 1, 4, 64):
    for n_ch in (1,):
        seq = rng.integers(0, 16, size=200).tolist()
        h = RepetitionHistory(n_ch, window)
        states = []
        for c in seq:
            h[0].add(c)
            states.append(sorted(list(h[0])))
        hist_cases.append(dict(window=window, seq=seq, states=states, lens=[len(s) for s in states]))

json.dump(dict(sample=cases, hist=hist_cases), open("crates/tts-worker/tests/golden.json", "w"))
print(len(cases), "ca lấy mẫu;", len(hist_cases), "ca cửa sổ")
