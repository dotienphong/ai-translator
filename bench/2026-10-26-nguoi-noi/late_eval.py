"""Chấm chốt nhãn muộn bằng bản Rust (`latency-bench speaker-eval --embeddings-in --late-relabel-ms N`) trên cache nhúng, so với
bản mô phỏng Python `callsim_sweep.cluster_delay`. Nhãn chấm là nhãn CUỐI của mỗi đoạn (dòng JSONL của speaker-eval đã áp
`Assign` sau cùng). Ba bộ như `callsim_sweep.load_sets`: call (kiểu cuộc gọi), ami, cv.

Dùng (không `-I`, vì import callsim_sweep cùng thư mục):
  python late_eval.py <latency-bench> <DATA> [--cache emb|emb4] [--delays 0 15000 30000 60000] [--no-sim]
"""
import argparse
import os
import subprocess
import tempfile

import callsim_sweep
from callsim_sweep import DEFAULT, cluster, cluster_delay, load_sets, summarize_rows
from score_spk import read_jsonl


# `Rec` không giữ đường dẫn cache; công cụ Rust cần nó.
_orig_init = callsim_sweep.Rec.__init__


def _init(self, path_emb, path_rttm, name):
    self.path_emb = path_emb
    _orig_init(self, path_emb, path_rttm, name)


callsim_sweep.Rec.__init__ = _init


def rust_labels(binary, rec, late_ms, extra=()):
    with tempfile.TemporaryDirectory() as t:
        out = os.path.join(t, "x.jsonl")
        subprocess.run([binary, "speaker-eval", "--embeddings-in", rec.path_emb, "--late-relabel-ms", str(late_ms), "--out", out,
                        *extra], check=True, stdout=subprocess.DEVNULL)
        return [s["voice"] for s in read_jsonl(out)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("binary")
    ap.add_argument("data")
    ap.add_argument("--cache", default="emb", choices=["emb", "emb4"])
    ap.add_argument("--delays", type=int, nargs="+", default=[0, 15000, 30000, 60000])
    ap.add_argument("--no-sim", action="store_true")
    a = ap.parse_args()
    sets = load_sets(a.data, a.cache)
    print("| bộ | cấu hình | mọi dòng % | ≥1 s % | tệ nhất % | giọng thừa | giọng thiếu | lệch với mô phỏng (điểm TB) |")
    print("|---|---|---|---|---|---|---|---|")
    for kind, recs in sets.items():
        for d in a.delays:
            rust = [r.score(rust_labels(a.binary, r, d)) for r in recs]
            s = summarize_rows(rust)
            gap = ""
            if not a.no_sim:
                sim_labels = [cluster(r.segs, DEFAULT) if d == 0 else cluster_delay(r, DEFAULT, d / 1000) for r in recs]
                sim = summarize_rows([r.score(l) for r, l in zip(recs, sim_labels)])
                gap = f"{s['all'] - sim['all']:+.2f} (mô phỏng {sim['all']:.1f})"
            name = "mặc định cũ (tắt)" if d == 0 else f"chốt muộn {d // 1000} s"
            print(f"| {kind} (n={s['n']}) | {name} | {s['all']:.1f} | {s['s1']:.1f} | {s['worst_all']:.1f} | {s['extra']} | {s['missing']} | {gap} |")


if __name__ == "__main__":
    main()
