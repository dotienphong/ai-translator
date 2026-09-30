"""S6: gộp các file kết quả của `latency-bench latency` thành bảng, và so với A2.

Nhãn (--label) đặt theo mẫu <máy>-<hạng>-<gói>[-ctx<N>]-<session>, với hạng là `khuyennghi` hoặc `toithieu`,
ví dụ `m1-16gb-khuyennghi-chuan-en`.

Cột RAM lấy số lớn hơn giữa RSS và `phys_footprint` (chỉ có trên macOS) của từng tiến trình:
- RSS tính cả trang của file model được mmap (llama-server), còn `phys_footprint` thì không.
- `phys_footprint` tính bộ nhớ Metal (asr-worker), còn RSS thì không.
VRAM trên Windows xem file vram-*.csv của vram-sample.ps1.
Cột CPU: tổng CPU trung bình của latency-bench (đóng vai app), asr-worker và llama-server, tính theo phần trăm
của cả máy. §8 đặt mục tiêu ≤ 30% trên máy khuyến nghị.

Các cột đếm (file kết quả cũ chưa ghi thì hiện —):
- Ghép được: số câu ghép được với một đoạn, trên số câu thật. Câu không ghép được không có độ trễ.
- Câu không có bản dịch: trong các câu ghép được, số câu có đoạn bị bỏ hoặc không cần dịch (cùng ngôn ngữ đích).
- Đoạn bỏ qua: số đoạn theo lý do. `no_speech`, `too_short`, `too_long` (không gửi cho worker) và `empty_translation`
  là đoạn bị bỏ: không hiện gì nên không có độ trễ và không vào p50, p90. `same_lang` (hiện luôn bản chép lời) và
  `lang_ngoai_tap` thì có độ trễ.
- Cụt (length): bản dịch chạm max_tokens (§6.5), tức bị cắt cụt.
- Lệch mốc dừng: lệch lớn nhất giữa mốc dừng của đoạn ghép được và mốc dừng thật của câu. Cỡ vài trăm ms trở lên thì
  mốc thật không khớp lúc người nói dừng, và độ trễ của câu đó lệch cùng cỡ (xem build_sessions.py).
- Phát lại trễ: độ trễ lớn nhất của luồng phát lại so với thời gian thực. Cỡ vài chục ms trở lên thì máy đang bận
  và độ trễ đo được bị lệch cùng cỡ.

Dùng:  python3 bench/phase0/latency/summarize.py bench/phase0/results/latency/*.json
"""
import json
import os
import sys

A2 = {"khuyennghi": {"shown_p50_ms": 2000, "shown_p90_ms": 3000, "first_p50_ms": 1000},
      "toithieu": {"shown_p50_ms": 3500}}


def count(s, key):
    return f"{s[key]:.0f}" if key in s else "—"


def skipped(s):
    """Số đoạn bỏ qua theo lý do, chỉ liệt kê lý do có mặt."""
    reasons = {k[len("skipped_"):]: v for k, v in s.items() if k.startswith("skipped_")}
    if not reasons:
        return "—"
    return ", ".join(f"{r} {v:.0f}" for r, v in sorted(reasons.items()) if v) or "0"


def main():
    rows = []
    for path in sys.argv[1:]:
        r = json.load(open(path, encoding="utf-8"))
        tier = next((t for t in A2 if f"-{t}-" in r["label"]), None)
        s, u = r["summary"], r["usage"]
        checks = A2.get(tier, {})
        verdict = all(s.get(k, float("inf")) <= v for k, v in checks.items()) if checks else None
        cores = int(r["machine"].get("logical_cores") or 1)
        cpu_load = sum(p.get("avg_cpu_percent", 0) for p in u.values()) / cores
        rows.append((r["label"], r["machine"].get("cpu", ""), s, u, cpu_load, verdict))
    print("| Nhãn | Máy | p50 | p90 | Chữ đầu p50 | ASR p50 | LID p50 | Dịch p50 | RAM asr / llama (MB) | CPU cả máy "
          "| Ghép được | Câu không có bản dịch | Đoạn bỏ qua | Cụt (length) | Lệch mốc dừng (ms) "
          "| Phát lại trễ (ms) | A2 |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for label, cpu, s, u, cpu_load, verdict in sorted(rows):
        ram = " / ".join(f"{max(u.get(p, {}).get('peak_rss_mb', 0), u.get(p, {}).get('peak_footprint_mb', 0)):.0f}"
                         for p in ("asr-worker", "llama-server"))
        mark = "—" if verdict is None else ("đạt" if verdict else "**KHÔNG ĐẠT**")
        print(f"| {label} | {cpu} | {s['shown_p50_ms']:.0f} | {s['shown_p90_ms']:.0f} | {s['first_p50_ms']:.0f} | "
              f"{s['asr_p50_ms']:.0f} | {s['lid_p50_ms']:.0f} | {s.get('mt_p50_ms', 0):.0f} | {ram} | {cpu_load:.0f}% | "
              f"{s['matched']:.0f}/{s['utterances']:.0f} | {count(s, 'no_translation')} | {skipped(s)} | "
              f"{count(s, 'finish_length')} | {count(s, 'end_offset_max_abs_ms')} | "
              f"{count(s, 'feed_lag_max_ms')} | {mark} |")


if __name__ == "__main__":
    main()
