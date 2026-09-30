"""S6: gộp các file kết quả của `latency-bench latency` thành bảng, và so với A2.

Nhãn (--label) đặt theo mẫu <máy>-<hạng>-<gói>[-ctx<N>][-cpu][-<llama-args>][-nomerge]-<session>, với hạng là `khuyennghi`
hoặc `toithieu`, ví dụ `m1-16gb-khuyennghi-chuan-en`. Nhãn trùng nhau thì các dòng xếp theo thứ tự đã cho.

Không kết luận đạt hay không đạt A2 khi lượt đo không đáng tin: cột A2 ghi "KHÔNG KẾT LUẬN" kèm lý do (hàm `problems`):
- đo được dưới 85% số câu (câu không ghép được với đoạn nào, đoạn bị bỏ, hoặc LID nhầm sang ngôn ngữ đích);
- luồng phát lại trễ hơn thời gian thực quá 100 ms (máy bận, nên độ trễ lệch cùng cỡ);
- mốc dừng của một đoạn lệch mốc thật quá 300 ms (mốc thật không khớp lúc người nói dừng);
- file kết quả cũ thiếu các số trên (gồm cả số lần ghép câu), hoặc không đo được câu nào.

Dòng của lượt tắt ghép câu (`config.merge` là "false", nhãn có `nomerge`) chỉ báo số, không kết luận A2: app luôn ghép câu (§6.3),
lượt đó chỉ để so ảnh hưởng của việc ghép.

Cột RAM lấy số lớn hơn giữa RSS và `phys_footprint` (chỉ có trên macOS) của từng tiến trình:
- RSS tính cả trang của file model được mmap (llama-server), còn `phys_footprint` thì không; RSS chỉ tính từ lúc bắt đầu phát lại.
- `phys_footprint` tính bộ nhớ Metal (asr-worker), và là đỉnh từ lúc tiến trình khởi động, gồm cả lúc nạp model.
VRAM trên Windows xem file vram-*.csv của vram-sample.ps1.
Cột CPU: tổng CPU trung bình của latency-bench (đóng vai app), asr-worker và llama-server, tính theo phần trăm của cả máy.
§8 đặt mục tiêu ≤ 30% trên máy khuyến nghị.

Các cột đếm (file kết quả cũ chưa ghi thì hiện —):
- Đo được: số câu có độ trễ trên số câu thật. p50 và p90 chỉ tính trên các câu này.
- Ghép được: số câu ghép được với một đoạn, trên số câu thật. Câu không ghép được không có độ trễ.
- Câu không có bản dịch: trong các câu ghép được, số câu có đoạn bị bỏ hoặc không cần dịch (cùng ngôn ngữ đích).
- Đoạn bỏ qua: số đoạn theo lý do. `no_speech`, `too_short`, `too_long` (không gửi cho worker) và `empty_translation`
  là đoạn bị bỏ: không hiện gì nên không có độ trễ và không vào p50, p90. `same_lang` (hiện luôn bản chép lời) và
  `lang_ngoai_tap` thì có độ trễ, trừ khi câu thật không phải tiếng đích (LID nhầm, xem cột LID nhầm).
- Cụt (length): bản dịch chạm max_tokens (§6.5), tức bị cắt cụt.
- Ghép câu: số đoạn đã được ghép vào câu đang mở (§6.3), tức số lần dịch lại cả câu.
- LID nhầm: số câu mà ngôn ngữ nhận diện khác ngôn ngữ thật, và trong ngoặc là số câu bị nhận diện thành ngôn ngữ đích.
- Lệch mốc dừng: lệch lớn nhất giữa mốc dừng của đoạn ghép được và mốc dừng thật của câu.
- Chờ hàng đợi: p90 thời gian chờ trước luồng ASR và trước luồng dịch (ms). Thường là 0; số lớn nghĩa là các đoạn xếp hàng.
- Phát lại trễ: độ trễ lớn nhất của luồng phát lại so với thời gian thực.

Dùng:  python3 bench/phase0/latency/summarize.py bench/phase0/results/latency/*.json
"""
import json
import sys

A2 = {"khuyennghi": {"shown_p50_ms": 2000, "shown_p90_ms": 3000, "first_p50_ms": 1000},
      "toithieu": {"shown_p50_ms": 3500}}
# Ngưỡng để một lượt đo còn đáng tin.
MIN_MEASURED = 0.85  # tỉ lệ số câu đo được trên số câu thật
MAX_FEED_LAG_MS = 100
MAX_END_OFFSET_MS = 300
NEEDED = ("utterances", "measured", "merges", "feed_lag_max_ms", "end_offset_max_abs_ms", "shown_p50_ms", "shown_p90_ms",
          "first_p50_ms")


def number(s, key):
    """Số trong summary làm tròn thành chuỗi, hoặc — nếu file kết quả chưa ghi."""
    return f"{s[key]:.0f}" if key in s else "—"


def skipped(s):
    """Số đoạn bỏ qua theo lý do, chỉ liệt kê lý do có mặt."""
    reasons = {k[len("skipped_"):]: v for k, v in s.items() if k.startswith("skipped_")}
    if not reasons:
        return "—"
    return ", ".join(f"{r} {v:.0f}" for r, v in sorted(reasons.items()) if v) or "0"


def problems(s):
    """Lý do lượt đo không đáng tin để kết luận đạt hay không đạt A2; danh sách rỗng nếu đáng tin."""
    if s.get("measured") == 0:
        return ["không đo được câu nào"]
    missing = [k for k in NEEDED if k not in s]
    if missing:
        return ["file kết quả cũ, thiếu " + ", ".join(missing)]
    out = []
    if s["measured"] / s["utterances"] < MIN_MEASURED:
        out.append(f"chỉ đo được {s['measured']:.0f}/{s['utterances']:.0f} câu")
    if s["feed_lag_max_ms"] > MAX_FEED_LAG_MS:
        out.append(f"phát lại trễ tới {s['feed_lag_max_ms']:.0f} ms")
    if s["end_offset_max_abs_ms"] > MAX_END_OFFSET_MS:
        out.append(f"mốc dừng lệch tới {s['end_offset_max_abs_ms']:.0f} ms")
    return out


def verdict(tier, s):
    if tier is None:
        return "—"
    why = problems(s)
    if why:
        return "**KHÔNG KẾT LUẬN**: " + "; ".join(why)
    return "đạt" if all(s[k] <= v for k, v in A2[tier].items()) else "**KHÔNG ĐẠT**"


def main():
    rows = []
    for path in sys.argv[1:]:
        r = json.load(open(path, encoding="utf-8"))
        tier = next((t for t in A2 if f"-{t}-" in r["label"]), None)
        if r.get("config", {}).get("merge") == "false":
            tier = None  # lượt so sánh không ghép câu: không phải cấu hình của app
        s, u = r["summary"], r["usage"]
        cores = int(r["machine"].get("logical_cores") or 1)
        cpu_load = sum(p.get("avg_cpu_percent", 0) for p in u.values()) / cores
        rows.append((r["label"], r["machine"].get("cpu", ""), s, u, cpu_load, verdict(tier, s)))
    print("| Nhãn | Máy | p50 | p90 | Chữ đầu p50 | ASR p50 | LID p50 | Dịch p50 | RAM asr / llama (MB) | CPU cả máy "
          "| Đo được | Ghép được | Câu không có bản dịch | Đoạn bỏ qua | Cụt (length) | Ghép câu | LID nhầm (→ đích) "
          "| Lệch mốc dừng (ms) | Chờ hàng đợi p90 asr / dịch (ms) | Phát lại trễ (ms) | A2 |")
    print("|" + "---|" * 21)
    for label, cpu, s, u, cpu_load, mark in sorted(rows, key=lambda r: r[0]):
        ram = " / ".join(f"{max(u.get(p, {}).get('peak_rss_mb', 0), u.get(p, {}).get('peak_footprint_mb', 0)):.0f}"
                         for p in ("asr-worker", "llama-server"))
        measured = f"{s['measured']:.0f}/{s['utterances']:.0f}" if "measured" in s and "utterances" in s else "—"
        matched = f"{s['matched']:.0f}/{s['utterances']:.0f}" if "matched" in s and "utterances" in s else "—"
        lid = f"{number(s, 'lid_mismatch')} ({number(s, 'lid_to_target')})"
        wait = f"{number(s, 'asr_wait_p90_ms')} / {number(s, 'mt_wait_p90_ms')}"
        print(f"| {label} | {cpu} | {number(s, 'shown_p50_ms')} | {number(s, 'shown_p90_ms')} | "
              f"{number(s, 'first_p50_ms')} | {number(s, 'asr_p50_ms')} | {number(s, 'lid_p50_ms')} | "
              f"{number(s, 'mt_p50_ms')} | {ram} | {cpu_load:.0f}% | {measured} | {matched} | "
              f"{number(s, 'no_translation')} | {skipped(s)} | {number(s, 'finish_length')} | {number(s, 'merges')} | "
              f"{lid} | {number(s, 'end_offset_max_abs_ms')} | {wait} | {number(s, 'feed_lag_max_ms')} | {mark} |")


if __name__ == "__main__":
    main()
