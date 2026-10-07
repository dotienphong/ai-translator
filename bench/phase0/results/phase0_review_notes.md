# Phase 0: nguồn của các số không có file kết quả riêng

Ngày: 2026-10-01. Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`.

File này gom các số mà spec dùng nhưng không có file kết quả riêng trong `bench/phase0/results/`. Nguồn của chúng chỉ là kế hoạch 00, một commit, hoặc comment trong code. Mỗi số ghi: chỗ spec dùng, nguồn, điều kiện đo, mức tin cậy.

Mức tin cậy:
- **Kiểm lại được:** tính lại được từ file đã commit, hoặc suy ra được từ số khác.
- **Một nguồn:** chỉ có một câu trong kế hoạch, commit hay comment. Không có log hay dữ liệu thô đã commit.
- **Ước lượng:** review tự tính lại từ JSON bằng cách gần đúng (script ở cuối file).

Số dòng của kế hoạch 00 (`docs/superpowers/plans/2026-09-29-phase-0-00-tong-quan.md`) tính theo bản ở commit `e181e1d`.

## Các số

### Flash attention: chép lời nhanh hơn 5–13%, giảm 91–149 MB bộ nhớ đệm mỗi state

- Spec: §6.4, "Flash attention: tắt".
- Nguồn: kế hoạch 00 dòng 95, thêm ở commit `404cbce` (review 03-T4).
- Điều kiện: M4 Pro, Metal, whisper.cpp 1.8.3 kèm bản vá mask của ggml-org/whisper.cpp#3941. Không rõ model, bộ clip và số lần đo.
- Tin cậy: một nguồn. Kết luận "trùng hệt bản tắt flash" cũng chỉ có một nguồn.

### Khoảng 15 giây kiểm tra lần đầu chạy một binary mới trên macOS

- Spec: §6.5, "Lần đầu chạy một binary mới"; §6.4, "Khi tiến trình phụ lỗi".
- Nguồn: kế hoạch 00 dòng 271, thêm ở commit `b7ad55f`.
- Điều kiện: lần đầu chạy `llama-server` b11146 trên macOS. Binary không nằm trong một bộ cài đã ký và notarize của app. Kế hoạch không ghi máy nào.
- Tin cậy: một nguồn. Không có log, không rõ số lần đo. Kế hoạch ghi phải đo lại với bản đã ký và notarize ở MVP.

### Khoảng 0,5 MB mỗi khung và RSS tăng khoảng 1 GB mỗi phút khi thiếu `detach()`

- Spec: §6.3, "Cách chạy Silero".
- Nguồn:
  - kế hoạch 00 dòng 91, thêm ở commit `91780f2`;
  - kế hoạch 03 dòng 593;
  - comment ở `crates/pipeline/src/vad.rs` dòng 93, thêm ở commit `4737b5d`.
- Điều kiện: review lúc thực thi kế hoạch 03, Task 2. Silero v6.2.3 chạy bằng candle-onnx 0.11, chạy liên tục.
- Tin cậy: một nguồn, nhưng hai số nhất quán với nhau: 0,5 MB × 1875 khung mỗi phút (khung 32 ms) ≈ 0,94 GB mỗi phút. Test `vad_reference` (chạy thêm 4 000 khung) giữ cho lỗi không quay lại.

### LID đoạn ngắn: nhận đúng thêm 7/60 đoạn, sai thêm 5/60 đoạn

- Spec: §6.4, "Chọn ngôn ngữ", mục "Đánh đổi".
- Nguồn: kế hoạch 00 dòng 226 ("Với lát cắt 1 giây"), thêm ở commit `9d488c3`.
- Điều kiện: đoạn dài 1 giây. Repo không mô tả cách dựng: không rõ cắt từ clip nào, và "đổi ngôn ngữ thật" được giả lập ra sao.
- Tin cậy: một nguồn, cách đo không rõ. Nên dựng lại phép thử có script trước khi dùng số này cho quyết định mới.

### Luật lặp 2 bản bắt đúng 3 clip chép hai lần, không bắt nhầm clip nào

- Spec: §6.4, "Dừng khi lặp".
- Nguồn:
  - kế hoạch 00 dòng 234;
  - commit `e6ccf14`: so với lượt `minctx512` cũ, small chỉ đổi `zh-17449495458038572773_nb` (42 xuống 7 lỗi), turbo chỉ đổi `ko-13932034022230918300` (76 xuống 6) và `ko-3125902811250465815` (19 xuống 3).
- Điều kiện: A4, 548 clip, chế độ B, sàn 512. Hai lượt `minctx512` và `final`.
- Tin cậy: kiểm lại được về tổng lỗi.
  - Turbo `ko-wb`: 254 → 168 lỗi (−86 = −70 − 16).
  - Small `zh-nb`: CER 0,1729 → 0,1344 trên 908 ký tự (−35).
  - Chưa kiểm được từng clip, vì bản chép từng clip nằm ở `bench/phase0/data/`, không commit.

### Lời lặp thật bị gom: 6/80 cặp

- Spec: §6.4, "Dừng khi lặp", mục "Đánh đổi".
- Nguồn: kế hoạch 00 dòng 235 ("thử ghép đôi thì gặp ở 6/80 cặp"), thêm ở commit `9d488c3`.
- Điều kiện: repo không mô tả cách dựng 80 cặp.
- Tin cậy: một nguồn, cách đo không rõ.

### zh: khoảng 7/18 lần ghép nối nhầm hai câu khác nhau

- Spec: §6.3, "Tiếng Trung và tiếng Nhật".
- Nguồn: kế hoạch 00 dòng 260, thêm ở commit `ffb37b7`.
- Điều kiện: session `zh` của S6, gói Chuẩn, đo trước khi có sàn 512 (`m4pro-khuyennghi-chuan-zh.json`, 18 lần ghép).
- Tin cậy: một nguồn. Review ước lượng lại (xem cuối file): coi một lần ghép là nhầm khi đoạn trước của nó là đoạn cuối của một câu thật.

  | Lượt | Lần ghép nhầm / lần ghép |
  |---|---|
  | Chuẩn, không sàn | 6/18 |
  | Nhẹ, không sàn | 7/21 |
  | Chuẩn, cấu hình chốt | 6/17 |
  | Nhẹ, cấu hình chốt | 5/18 |

### "Số câu còn nguyên vẹn như nhau dù ghép hay không"

- Spec: §6.3, "Tiếng Trung và tiếng Nhật", mục "Giữ luật hiện tại".
- Nguồn: kế hoạch 00 dòng 241 (ghi cho zh), thêm ở commit `9d488c3`.
- Điều kiện: session S6, lượt ghép so với lượt `-nomerge`, trước khi có sàn 512.
- Tin cậy: một nguồn. Ước lượng lại của review cho thấy câu này chỉ đúng với zh; với ja, ghép giữ nguyên vẹn nhiều câu hơn.

  | Session | Ghép | Tắt ghép |
  |---|---|---|
  | Chuẩn zh | 10/23 | 11/23 |
  | Nhẹ zh | 10/23 | 11/23 |
  | Chuẩn ja | 14/20 | 11/20 |
  | Nhẹ ja | 13/20 | 11/20 |

  "Nguyên vẹn" là câu thật có đúng các đoạn của một nhóm ghép, không lẫn đoạn của câu khác.

### Câu tiếng Hàn đúng có `no_speech_prob` 0,62 và `avg_logprob` −0,25

- Spec: §6.4, "Lọc lỗi ảo giác".
- Nguồn:
  - commit `76b0158`;
  - comment ở `crates/latency-bench/src/latency.rs` dòng 30 và 1065.
- Điều kiện: S6, gói Nhẹ, lượt trước khi có sàn. `m4pro-khuyennghi-nhe-ko.json`, đoạn 37 dài 6368 ms: "조종사들에게 더 정확한 정보를 제공한다.", `no_speech_prob` 0,625, bị luật cũ bỏ.
- Tin cậy:
  - `no_speech_prob` kiểm lại được từ JSON.
  - `avg_logprob` −0,25 chỉ có một nguồn: lượt đó chưa ghi `avg_logprob`, nên số này phải đo sau, bằng bản build có trường này.

### 6,35 token/giây (p99 của lời nói không lặp trên FLEURS)

- Spec: §6.4, "Trần số token mới".
- Nguồn:
  - kế hoạch 03 dòng 2925;
  - comment ở `crates/asr-worker/src/shared.rs` dòng 339, thêm ở commit `8f24130`.
- Điều kiện: review lúc thực thi kế hoạch 03, Task 9. Whisper small, chế độ B, 548 clip A4. Lớn nhất 7,75 token/giây (zh).
- Tin cậy: một nguồn. Mới đo trên small, chưa đo trên turbo hay lời nói tự nhiên.

## Số trong bản spec trước đã được thay

Các số dưới đây có ở commit `e181e1d`, lấy từ kế hoạch 00, nhưng không khớp file kết quả. Spec nay dùng số tính từ JSON:

| Chỗ trong spec | Bản cũ | Nay | Nguồn |
|---|---|---|---|
| §6.3, chi phí ghép câu | +60–100 ms p50, +200 ms p90 | p50 +36 đến +140 ms, p90 +74 đến +356 ms | `m4pro-khuyennghi-{chuan,nhe}-{zh,ja}.json` so với `*-nomerge-*` |
| §6.4, chi phí sàn trên S6 | turbo +22 ms p50 | nhận dạng p50 turbo +32 đến +76 ms; độ trễ tổng thể p50 gộp mọi câu 965 → 984 ms | `m4pro-khuyennghi-*` so với `*-ctx512-*` |
| §6.4, giả định 8 | 2/10 ô (final so với fullctx cũ) | 3/10 ô trên cùng bản build | `s7_asr.md`, bảng "Với mức sàn 512" |

## Script ước lượng lại

Chạy từ gốc repo với `python3` (chỉ đọc các file JSON đã commit):

```python
import glob, json, statistics as st

L = "bench/phase0/results/latency/"
END = (".", "?", "!", "。", "？", "！")

def load(name):
    return json.load(open(L + name + ".json"))

def groups_and_owner(d):
    """Nhóm ghép (theo merged_segments) và câu thật chứa mỗi đoạn."""
    ends = sorted(u["segment_id"] for u in d["utterances"] if u.get("segment_id") is not None)
    owner, j = {}, 0
    for s in d["segments"]:
        while j < len(ends) and s["id"] > ends[j]:
            j += 1
        owner[s["id"]] = j
    groups, cur = [], []
    for s in d["segments"]:
        m = s.get("merged_segments")
        if m is None:
            continue
        if m == 1 and cur:
            groups.append(cur)
            cur = []
        cur.append(s["id"])
    if cur:
        groups.append(cur)
    return ends, owner, groups

def wrong_merges(d):
    ends, _, _ = groups_and_owner(d)
    segs = d["segments"]
    merges = [k for k, s in enumerate(segs) if (s.get("merged_segments") or 1) > 1]
    return sum(segs[k - 1]["id"] in ends for k in merges), len(merges)

def intact(d):
    ends, owner, groups = groups_and_owner(d)
    per_utt = {}
    for g in groups:
        for sid in g:
            per_utt.setdefault(owner[sid], set()).add(sid)
    return sum(any(set(g) == v for g in groups) for v in per_utt.values()), len(ends)

def punct(d):
    segs = d["segments"]
    return sum(s["text"].strip().endswith(END) for s in segs), len(segs)

for name in ["m4pro-khuyennghi-chuan-zh", "m4pro-khuyennghi-nhe-zh",
             "m4pro-chot-khuyennghi-chuan-zh", "m4pro-chot-khuyennghi-nhe-zh"]:
    print(name, "ghép nhầm/ghép = %d/%d" % wrong_merges(load(name)))
for pk in ["chuan", "nhe"]:
    for s in ["zh", "ja"]:
        a = load(f"m4pro-khuyennghi-{pk}-{s}")
        b = load(f"m4pro-khuyennghi-{pk}-nomerge-{s}")
        print(pk, s, "nguyên vẹn: ghép %d/%d" % intact(a), "tắt ghép %d/%d" % intact(b),
              "chênh p50 %+.0f p90 %+.0f ms" % (a["summary"]["shown_p50_ms"] - b["summary"]["shown_p50_ms"],
                                                a["summary"]["shown_p90_ms"] - b["summary"]["shown_p90_ms"]))
for name in sorted(glob.glob(L + "m4pro-chot-*.json")):
    print(name.split("/")[-1], "đoạn kết thúc bằng dấu câu %d/%d" % punct(json.load(open(name))))
for pk in ["chuan", "nhe"]:
    asr, shown_a, shown_b = [], [], []
    for s in ["en", "ja", "ko", "mixed", "vi", "zh"]:
        a = load(f"m4pro-khuyennghi-{pk}-{s}")
        b = load(f"m4pro-khuyennghi-{pk}-ctx512-{s}")
        asr.append(b["summary"]["asr_p50_ms"] - a["summary"]["asr_p50_ms"])
        shown_a += [u["shown_latency_ms"] for u in a["utterances"] if u.get("shown_latency_ms") is not None]
        shown_b += [u["shown_latency_ms"] for u in b["utterances"] if u.get("shown_latency_ms") is not None]
    print(pk, "sàn 512: nhận dạng p50 %+.0f đến %+.0f ms" % (min(asr), max(asr)),
          "tổng thể p50 gộp %.0f -> %.0f ms" % (st.median(shown_a), st.median(shown_b)))
```
