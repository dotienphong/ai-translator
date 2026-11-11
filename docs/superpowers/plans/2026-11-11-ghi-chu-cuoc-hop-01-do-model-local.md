# Ghi chú cuộc họp, kế hoạch 01: đo model local trước khi làm

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** có bộ thử, công cụ đo và đủ số đo để chọn model ghi chú chạy trên máy (hay kết luận không model nào đạt) trước khi viết mã tính năng.

**Architecture:** spike bằng Python trong `bench/2026-11-11-ghi-chu-cuoc-hop/`, không sửa mã app (trừ một test ở `manifest.rs`). Thư viện `notes_lib.py` đọc bản chép lời app xuất ra, chia đoạn, kiểm JSON; `run_notes.py` chạy map-reduce qua `llama-server` b11146 của repo hay qua API cloud; hai script chấm tự động và chấm tay. Mẫu prompt và schema nằm ở file riêng để kế hoạch 02 nhúng nguyên văn vào Rust.

**Tech Stack:** Python 3.12 qua `uv` (thư viện chuẩn + `psutil`, bản ổn định mới nhất lúc cài, ghi số bản vào README); `llama-server` b11146 (`tools/llama-b11146/`); Rust chỉ cho Task 9.

**Spec:** `docs/superpowers/specs/2026-11-11-ghi-chu-cuoc-hop-design.md` mục 2 (G4, G8), 5, 10, 11.

**Các kế hoạch của spec này:** 01 đo model local (file này, bước chặn) · 02 lõi `notes/` và Cloud · 03 Local, manifest, gói ghi chú · 04 màn hình "Ghi chú cuộc họp" · 05 pháp lý, website, phát hành. Kế hoạch 02 không phụ thuộc kết quả 01; kế hoạch 03 chỉ viết sau Task 10.

**Quy ước:**
- Lệnh viết cho Git Bash trên Windows. `W=/d/Dev/WORKSPACE/ai-translator` (nhánh `ghi-chu-cuoc-hop`), `B=$W/bench/2026-11-11-ghi-chu-cuoc-hop`, `DATA=/d/Dev/WORKSPACE/ai-translator-data/ghi-chu` (ngoài repo).
- `PY="uv run --python 3.12 --with psutil python"`. Mọi lệnh bắt đầu bằng `cd $B &&`.
- **Không vào git:** file GGUF, bản chép lời, đầu ra của model, phiếu chấm (đều ở `$DATA`). `$B/results/` chỉ có số và tên nguồn, không có chữ của cuộc họp.
- API key cloud chỉ qua biến môi trường `OPENAI_API_KEY`, `GEMINI_API_KEY` của phiên shell; không ghi ra file.
- Không push, không merge, không deploy.
- Task có nhãn **(cần chủ dự án)**: hỏi trước khi chạy.

## Global Constraints

- Không sửa crate `pipeline`, `cloud_mt.rs`, `session.rs`, hay bất kỳ mã chạy nào của app.
- `llama-server` dùng bản đang khóa b11146. Không nâng bản của đường dịch (spec §11.1).
- Ứng viên: model đa ngôn ngữ cỡ 4B, giấy phép cho phép phân phối lại, bản ổn định mới nhất lúc đo, lượng tử hóa Q4 (spec §10).
- Ngưỡng đạt (spec §10, không đổi sau khi thấy số đo): JSON hợp lệ sau tối đa một lần thử lại ≥ 98%; `refs` đúng ≥ 90%; việc cần làm bịa ≤ 1 mỗi 10 cuộc họp; phiên 60 phút xong trong ≤ 3 phút có GPU và ≤ 10 phút chỉ CPU trên máy 16 GB; RAM đỉnh của tiến trình ghi chú ≤ 6 GiB.
- **Ngưỡng bổ sung của kế hoạch này** (spec nêu chỉ số nhưng chưa nêu ngưỡng; chủ dự án duyệt cùng kế hoạch): đúng ngôn ngữ đầu ra ở 20/20 bản chép lời.
- Ghi chú viết bằng ngôn ngữ đích của phiên. `owner` chỉ nhận tên có trong bản chép lời (spec §5).
- Chữ đưa vào prompt cho mỗi câu: bản dịch nếu có, không thì câu gốc; câu `dropped` bỏ qua.

## Review Focus

1. Bản xuất có câu "[bỏ qua đoạn]", câu "(chưa dịch được)", câu không có bản dịch: bộ đọc không được coi marker là lời nói (Task 1).
2. Một câu dài hơn ngân sách đoạn (bài giảng không ngắt): bộ chia đoạn vẫn tiến, không lặp vô hạn, không bỏ câu (Task 1).
3. Model bọc JSON trong ```` ``` ````, thêm khối `<think>`, hay viết lời dẫn trước JSON: vẫn đọc được (Task 2).
4. `refs` là chuỗi `"12"`, khoảng `"12-15"`, số không tồn tại, số của câu bị bỏ: giữ cái hợp lệ, bỏ cái còn lại, không lỗi (Task 2).
5. Phiên rỗng hay chỉ toàn câu bị bỏ: không gọi model, trả ghi chú rỗng (Task 3).

## Cấu trúc file

| File | Việc |
|---|---|
| Tạo `$B/notes_lib.py`, `$B/test_notes_lib.py` | đọc bản xuất Markdown, cắt theo phút, dựng chữ, chia đoạn, đọc JSON ghi chú, kiểm ngôn ngữ |
| Tạo `$B/prompts/{map,reduce,fix}.txt`, `$B/schema.json` | mẫu prompt và schema (kế hoạch 02 nhúng nguyên văn) |
| Tạo `$B/run_notes.py`, `$B/test_run_notes.py` | `run_job` (map-reduce, thử lại), backend local và cloud, đo thời gian và RAM |
| Tạo `$B/candidates.json` | ứng viên: nguồn, revision, file, bytes, SHA-256, giấy phép, cờ chạy |
| Tạo `$B/build_set.py` | `$DATA/raw/*.md` → 20 file `$DATA/set/*.jsonl` |
| Tạo `$B/score_auto.py` | bảng chỉ số tự động và cổng đạt |
| Tạo `$B/grading.py`, `$B/test_grading.py` | dựng phiếu chấm mù, chấm phiếu đã điền |
| Sửa `src-tauri/src/models/manifest.rs` (phần test) | khóa `notes` ở gốc manifest không làm app hiện tại lỗi |
| Tạo `$B/README.md`, `$B/results/*.md` | điều kiện đo, cách chạy lại, kết quả |
| Sửa spec §10, §11 | ghi model chốt và tham số |

---

### Task 0: Mốc ban đầu

**Files:** tạo `$B/results/may-do.md`

- [ ] **Step 1: Nhánh và thư mục**

Run: `cd $W && git switch -c ghi-chu-cuoc-hop && mkdir -p $B/prompts $B/results $DATA/{models,raw,set,out,grading} && uv --version`
Expected: nhánh mới; `uv` in số bản. Chưa có `uv` thì cài theo https://docs.astral.sh/uv/ rồi chạy lại.

- [ ] **Step 2: `llama-server` b11146 chạy được**

Run: `$W/tools/llama-b11146/win-vulkan-x64/llama-server.exe --version 2>&1 | head -3 && $W/tools/llama-b11146/win-vulkan-x64/llama-server.exe --list-devices 2>&1 | tail -5`
Expected: dòng version có `11146`; danh sách thiết bị Vulkan (rỗng nghĩa là máy không có GPU dùng được).

- [ ] **Step 3: Ghi máy đo vào `$B/results/may-do.md`**

Nội dung: CPU, số lõi, RAM (MiB), GPU và VRAM theo Step 2, Windows build, có GPU dùng được hay không. Máy không có GPU dùng được: mọi lượt `--hw gpu` của Task 6 ghi "chưa đo" và báo chủ dự án ở Task 10.

- [ ] **Step 4: Commit** `git add bench/2026-11-11-ghi-chu-cuoc-hop && git commit -m "bench(notes): máy đo của spike ghi chú cuộc họp"`

---

### Task 1: `notes_lib.py`: đọc bản xuất, cắt theo phút, dựng chữ, chia đoạn

**Files:** tạo `$B/notes_lib.py`, `$B/test_notes_lib.py`

**Interfaces (Produces):**
- `parse_markdown_export(md: str) -> list[dict]`: mỗi câu `{"seq": int (từ 1, theo thứ tự), "t": int (giây kể từ câu đầu), "speaker": str | None, "src": str, "tgt": str | None, "dropped": bool}`.
- `prefix(lines: list[dict], minutes: int) -> list[dict]`: các câu có `t <= minutes * 60`.
- `line_text(line: dict) -> str | None`: `None` nếu `dropped`; không thì `tgt or src`.
- `render_lines(lines: list[dict]) -> str`: mỗi câu một dòng `[seq] Speaker: text\n` (không có `Speaker: ` khi `speaker` là `None`).
- `chunk_lines(lines: list[dict], budget: int, count_tokens: Callable[[str], int]) -> list[list[dict]]`.

- [ ] **Step 1: Viết test đỏ** (`python -m unittest`, như `bench/2026-10-26-nguoi-noi/test_score_spk.py`: chèn thư mục file vào `sys.path`)

```python
MD = ("# Bản chép lời · 2026-10-02 14:05\n\n| Giờ | Câu gốc | Bản dịch |\n|---|---|---|\n"
      "| 14:05:01 | **Lan:** Good morning, everyone. | Chào buổi sáng mọi người. |\n"
      "| 14:05:09 | Xin chào. |  |\n"
      "| 14:05:15 | \\[bỏ qua đoạn\\] |  |\n"
      "| 14:20:01 | **Người 2:** The \\*final\\* \\| answer | (chưa dịch được) |\n")

def L(seq, words, dropped=False):
    return {"seq": seq, "t": 0, "speaker": None, "src": " ".join(["w"] * words), "tgt": None, "dropped": dropped}
count = lambda s: len(s.split())          # "[1] w w w w" = 5

class Export(unittest.TestCase):
    def test_parse(self):
        lines = parse_markdown_export(MD)
        self.assertEqual(lines[0], {"seq": 1, "t": 0, "speaker": "Lan", "src": "Good morning, everyone.",
                                    "tgt": "Chào buổi sáng mọi người.", "dropped": False})
        self.assertEqual((lines[1]["speaker"], lines[1]["tgt"]), (None, None))
        self.assertTrue(lines[2]["dropped"])
        self.assertEqual((lines[3]["speaker"], lines[3]["src"], lines[3]["tgt"], lines[3]["t"]),
                         ("Người 2", "The *final* | answer", None, 900))
        self.assertEqual(parse_markdown_export(""), [])
    def test_clock_wraps_at_midnight(self):
        md = MD.split("| 14:05:01")[0] + "| 23:59:50 | a |  |\n| 00:00:10 | b |  |\n"
        self.assertEqual([l["t"] for l in parse_markdown_export(md)], [0, 20])
    def test_prefix_and_render(self):
        lines = parse_markdown_export(MD)
        self.assertEqual([l["seq"] for l in prefix(lines, 10)], [1, 2, 3])
        self.assertEqual(render_lines(lines),
                         "[1] Lan: Chào buổi sáng mọi người.\n[2] Xin chào.\n[4] Người 2: The *final* | answer\n")

class Chunk(unittest.TestCase):
    def seqs(self, chunks): return [[l["seq"] for l in c] for c in chunks]
    def test_greedy_by_budget(self):
        self.assertEqual(self.seqs(chunk_lines([L(1, 4), L(2, 4), L(3, 4)], 10, count)), [[1, 2], [3]])
    def test_oversize_line_gets_its_own_chunk(self):
        self.assertEqual(self.seqs(chunk_lines([L(1, 50), L(2, 2)], 10, count)), [[1], [2]])
    def test_dropped_and_empty(self):
        self.assertEqual(chunk_lines([], 10, count), [])
        self.assertEqual(chunk_lines([L(1, 3, dropped=True)], 10, count), [])
        self.assertEqual(self.seqs(chunk_lines([L(1, 3), L(2, 3, dropped=True), L(3, 3)], 10, count)), [[1, 3]])
```

- [ ] **Step 2: Chạy, thấy đỏ.** Run: `cd $B && $PY -m unittest test_notes_lib -v`. Expected: `ImportError`.

- [ ] **Step 3: Viết năm hàm.** Các điểm không suy ra được từ test:
  - Bảng Markdown: bỏ ba dòng đầu bảng; tách ô theo `|` **không** đứng sau `\`; gỡ thoát mọi `\X` thành `X` (đúng tập ký tự của `escape_markdown` trong `src-tauri/src/transcript/export.rs`).
  - Người nói: ô Câu gốc khớp `^\*\*(.+?):\*\* ` thì phần trong ngoặc (đã gỡ thoát) là `speaker`.
  - Marker (giao diện tiếng Việt): câu gốc đúng bằng `[bỏ qua đoạn]` → `dropped`; bản dịch đúng bằng `(chưa dịch được)` hay rỗng → `tgt = None`.
  - `chunk_lines`: gom tham lam theo thứ tự, không chồng lấn; chi phí một câu là `count_tokens` của dòng đã dựng; câu vượt ngân sách đứng một mình trong đoạn của nó.

- [ ] **Step 4: Chạy lại, xanh.** Expected: `OK`, 6 test.

- [ ] **Step 5: Commit** `git commit -am "bench(notes): đọc bản xuất và chia đoạn"` (sau `git add`).

---

### Task 2: `notes_lib.py`: đọc JSON ghi chú và kiểm ngôn ngữ

**Files:** sửa `$B/notes_lib.py`, `$B/test_notes_lib.py`

**Interfaces (Produces):**
- `EMPTY_NOTES = {"summary": "", "decisions": [], "action_items": [], "open_questions": []}`
- `parse_notes(raw: str, lines: list[dict]) -> dict | None`: trả ghi chú đã chuẩn hóa, thêm khóa `"_stats": {"refs_total": int, "refs_invalid": int, "owners_cleared": int}`; `None` khi không đọc được.
- `lang_ok(notes: dict, lang: str) -> bool` với `lang` là `"vi"` hay `"en"`.

- [ ] **Step 1: Viết test đỏ**

```python
LINES = [{"seq": 1, "t": 0, "speaker": "Lan", "src": "x", "tgt": "Minh gửi báo cáo thứ Sáu", "dropped": False},
         {"seq": 2, "t": 5, "speaker": None, "src": "y", "tgt": None, "dropped": False},
         {"seq": 3, "t": 9, "speaker": None, "src": "z", "tgt": None, "dropped": True}]
GOOD = {"summary": "S", "decisions": [{"text": "D", "refs": [1, "2", 99, "1-2", 1, 3]}],
        "action_items": [{"text": "A", "owner": "minh", "due": "thứ Sáu", "refs": [1]},
                         {"text": "B", "owner": "Bob", "due": None, "refs": []},
                         {"text": "  ", "owner": "", "due": "", "refs": [1]}],
        "open_questions": []}

class Parse(unittest.TestCase):
    def test_normalizes(self):
        n = parse_notes(json.dumps(GOOD), LINES)
        self.assertEqual(n["decisions"], [{"text": "D", "refs": [1, 2]}])
        self.assertEqual(n["action_items"], [{"text": "A", "owner": "minh", "due": "thứ Sáu", "refs": [1]},
                                             {"text": "B", "owner": "", "due": "", "refs": []}])
        self.assertEqual(n["_stats"], {"refs_total": 7, "refs_invalid": 3, "owners_cleared": 1})
    def test_wrappers(self):
        body = json.dumps(GOOD)
        for raw in (f"```json\n{body}\n```", f"<think>hmm {{}}</think>\n{body}", f"Here are the notes:\n{body}\nDone."):
            self.assertEqual(parse_notes(raw, LINES)["summary"], "S")
    def test_rejects(self):
        for bad in ("not json", "[]", json.dumps({**GOOD, "decisions": "none"}),
                    json.dumps({k: v for k, v in GOOD.items() if k != "summary"}), json.dumps({**GOOD, "summary": 5})):
            self.assertIsNone(parse_notes(bad, LINES))

class Lang(unittest.TestCase):
    def n(self, text): return {**EMPTY_NOTES, "summary": text}
    def test_lang(self):
        vi, en = "Cả nhóm thống nhất lùi hạn sang tuần sau.", "The team agreed to move the deadline to next week."
        self.assertTrue(lang_ok(self.n(vi), "vi")); self.assertFalse(lang_ok(self.n(en), "vi"))
        self.assertTrue(lang_ok(self.n(en), "en")); self.assertFalse(lang_ok(self.n(vi), "en"))
        self.assertFalse(lang_ok(self.n("团队同意将截止日期推迟到下周。"), "vi"))
        self.assertTrue(lang_ok(self.n(en + " Owner: 田中."), "en"))
        self.assertTrue(lang_ok(EMPTY_NOTES, "vi"))
```

- [ ] **Step 2: Chạy, thấy đỏ.** Run: `cd $B && $PY -m unittest test_notes_lib -v`. Expected: `ImportError: cannot import name 'parse_notes'`.

- [ ] **Step 3: Viết hai hàm.** Luật:
  - Trước khi đọc: bỏ mọi khối `<think>…</think>`; lấy đoạn từ `{` đầu tiên tới `}` khớp ngoặc của nó (đếm ngoặc, bỏ qua ngoặc trong chuỗi JSON).
  - Hợp lệ khi: là object, `summary` là chuỗi, ba khóa mảng đều có và đều là mảng. Thiếu hay sai kiểu → `None`.
  - Mục: bỏ mục không phải object hay `text` rỗng sau `strip`. Mục bị bỏ không tính vào `_stats`. `owner`, `due` không phải chuỗi → `""`.
  - `refs`: nhận số nguyên và chuỗi toàn chữ số; giữ số là `seq` của một câu **không** `dropped`; bỏ trùng, xếp tăng. `refs_total` đếm mọi phần tử nhận vào, `refs_invalid` đếm phần tử không giữ được vì không hợp lệ (trùng không tính).
  - `owner` giữ nguyên khi (không phân biệt hoa thường) trùng một `speaker` hay xuất hiện trong `line_text` của một câu; không thì `""` và `owners_cleared += 1`.
  - `lang_ok`: gộp `summary` và mọi `text`. Lấy các ký tự `isalpha()`; không có ký tự nào → `True`. Tỉ lệ chữ Hán, kana, Hangul > 0,05 → `False`. `"vi"`: tỉ lệ chữ có dấu (là `đ`/`Đ` hay NFD có ký tự kết hợp) ≥ 0,10. `"en"`: tỉ lệ chữ ngoài ASCII ≤ 0,05.

- [ ] **Step 4: Chạy lại, xanh.** Expected: `OK`, 10 test.

- [ ] **Step 5: Commit** `git commit -am "bench(notes): đọc JSON ghi chú, kiểm ngôn ngữ"`.

---

### Task 3: Mẫu prompt, schema và `run_job`

**Files:** tạo `$B/prompts/map.txt`, `reduce.txt`, `fix.txt`, `$B/schema.json`, `$B/run_notes.py`, `$B/test_run_notes.py`

**Interfaces:**
- Consumes: `chunk_lines`, `render_lines`, `parse_notes`, `EMPTY_NOTES` (Task 1, 2).
- Produces: `run_job(lines, lang, budget, count_tokens, call, max_map, max_reduce) -> dict` với `call(messages: list[dict], max_tokens: int) -> str`. Kết quả: `{"notes": dict | None, "raw_fallback": str | None, "chunks": int, "failed_chunks": int, "reduce_fallback": bool, "calls": [{"kind": "map" | "reduce", "valid_first": bool, "valid": bool}]}`.

- [ ] **Step 1: Ghi ba mẫu prompt nguyên văn**

`prompts/map.txt`:
```
You write meeting notes from a transcript. Each transcript line looks like "[number] Speaker: text"; the speaker may be missing. The transcript comes from speech recognition and machine translation, so it can contain errors.

Write the notes in {language}. Use only what the transcript says. Do not invent decisions, tasks, names or dates.

Reply with one JSON object and nothing else:
{"summary": string, "decisions": [{"text": string, "refs": [number]}], "action_items": [{"text": string, "owner": string, "due": string, "refs": [number]}], "open_questions": [{"text": string, "refs": [number]}]}

Rules:
- "summary": 3 to 6 sentences on what was discussed.
- "decisions": things the participants agreed on.
- "action_items": tasks someone has to do after the meeting. "owner" is the person's name exactly as it appears in the transcript, or "" if nobody was named. "due" is the deadline as said in the transcript, or "".
- "open_questions": questions raised and left unanswered.
- "refs": the numbers of the transcript lines that support the item, at most 5 per item. Every item needs at least one.
- Use [] for a list with nothing in it.

Transcript:
{transcript}
```

`prompts/reduce.txt`:
```
Below are notes written from consecutive parts of one meeting, in order, one JSON object per line. Merge them into one set of notes for the whole meeting.

Write in {language}. Keep the same JSON format. Merge items that say the same thing and join their "refs". Keep every other item. Do not add anything that is not in the parts. Keep "refs" numbers exactly as given. "summary": 4 to 8 sentences for the whole meeting.

Reply with one JSON object and nothing else.

Parts:
{parts}
```

`prompts/fix.txt`:
```
Your reply was not a valid JSON object in the required format. Reply again with the JSON object only.
```

`{language}` là `Vietnamese` hay `English`. Thay bằng `str.replace`, không dùng `str.format` (mẫu có ngoặc nhọn của JSON).

- [ ] **Step 2: Ghi `schema.json`**: JSON Schema của object trên: bốn khóa đều `required`, `additionalProperties: false` ở mọi cấp; `refs` là mảng `integer`; mục `action_items` bắt buộc `text`, `owner`, `due`, `refs`; mục của hai mảng kia bắt buộc `text`, `refs`.

- [ ] **Step 3: Viết test đỏ** (`call` giả trả lần lượt các chuỗi trong danh sách và ghi lại `messages`; chép `L` và `count` của Task 1 vào đầu file test)

```python
OK1 = json.dumps({"summary": "s1", "decisions": [{"text": "d1", "refs": [1]}], "action_items": [], "open_questions": []})
OK2 = json.dumps({"summary": "s2", "decisions": [{"text": "d2", "refs": [3]}], "action_items": [], "open_questions": []})
ALL = json.dumps({"summary": "all", "decisions": [{"text": "d", "refs": [1, 3]}], "action_items": [], "open_questions": []})
def job(lines, replies, budget=10):
    seen = []
    def call(messages, max_tokens):
        seen.append(messages); return replies[len(seen) - 1]
    return run_job(lines, "vi", budget, count, call, 800, 1500), seen

class Job(unittest.TestCase):
    def test_single_chunk(self):
        r, seen = job([L(1, 4)], [OK1])
        self.assertEqual((r["notes"]["summary"], r["chunks"], len(seen)), ("s1", 1, 1))
        self.assertIn("Write the notes in Vietnamese", seen[0][0]["content"])
    def test_retry_then_raw_fallback(self):
        r, seen = job([L(1, 4)], ["oops", "still bad"])
        self.assertEqual((r["notes"], r["raw_fallback"]), (None, "still bad"))
        self.assertEqual(r["calls"], [{"kind": "map", "valid_first": False, "valid": False}])
        self.assertEqual([m["role"] for m in seen[1]], ["user", "assistant", "user"])
        self.assertEqual(seen[1][1]["content"], "oops")
    def test_retry_succeeds(self):
        r, _ = job([L(1, 4)], ["oops", OK1])
        self.assertEqual(r["calls"], [{"kind": "map", "valid_first": False, "valid": True}])
    def test_map_reduce(self):
        r, seen = job([L(1, 4), L(2, 4), L(3, 4)], [OK1, OK2, ALL])
        self.assertEqual((r["chunks"], len(seen), r["notes"]["decisions"][0]["refs"]), (2, 3, [1, 3]))
        self.assertNotIn("_stats", seen[2][0]["content"])
    def test_reduce_fails_merges_mechanically(self):
        r, _ = job([L(1, 4), L(2, 4), L(3, 4)], [OK1, OK2, "bad", "bad"])
        self.assertTrue(r["reduce_fallback"])
        self.assertEqual((r["notes"]["summary"], [d["text"] for d in r["notes"]["decisions"]]), ("s1\ns2", ["d1", "d2"]))
    def test_failed_chunk_is_skipped(self):
        r, seen = job([L(1, 4), L(2, 4), L(3, 4)], ["bad", "bad", OK2])
        self.assertEqual((r["failed_chunks"], r["notes"]["summary"], len(seen)), (1, "s2", 3))
    def test_empty_transcript_calls_nothing(self):
        r, seen = job([L(1, 3, dropped=True)], [])
        self.assertEqual((r["notes"]["summary"], r["notes"]["decisions"], r["chunks"], seen), ("", [], 0, []))
```

- [ ] **Step 4: Chạy, thấy đỏ.** Run: `cd $B && $PY -m unittest test_run_notes -v`. Expected: `ImportError`.

- [ ] **Step 5: Viết `run_job`.** Thuật toán:
  1. `chunks = chunk_lines(...)`. Không có đoạn nào → trả `EMPTY_NOTES`, không gọi model.
  2. Mỗi đoạn: gọi `map` với `max_map`; `parse_notes(raw, lines)` (kiểm `refs` trên **toàn bộ** `lines`). `None` thì gọi lại một lần với `[user: prompt, assistant: raw, user: fix.txt]`. Vẫn `None`: nếu cả phiên chỉ một đoạn thì `raw_fallback` là chuỗi lần hai và `notes = None`; nếu nhiều đoạn thì bỏ đoạn đó, `failed_chunks += 1`.
  3. Còn đúng một bản thành phần → đó là kết quả. Không còn bản nào → `notes = None`, `raw_fallback` là chuỗi cuối cùng nhận được.
  4. Còn nhiều bản: gộp theo tầng. Mỗi bản thành phần là một dòng JSON gọn, đã bỏ `_stats`. Gom tham lam các dòng liền nhau vào nhóm có `count_tokens` ≤ `budget` (nhóm tối thiểu hai bản), gọi `reduce` với `max_reduce` cho từng nhóm, cùng luật thử lại; lặp tới khi còn một bản.
  5. Một nhóm `reduce` vẫn sai sau thử lại: gộp cơ học nhóm đó (`summary` nối bằng `\n`, ba mảng nối theo thứ tự) và đặt `reduce_fallback = True`.

- [ ] **Step 6: Chạy lại, xanh.** Expected: `OK`, 7 test.

- [ ] **Step 7: Commit** `git commit -am "bench(notes): mẫu prompt, schema, run_job"`.

---

### Task 4: `run_notes.py`: backend local, backend cloud, số đo

**Files:** sửa `$B/run_notes.py`

**Interfaces:**
- Consumes: `run_job` (Task 3); `$B/candidates.json` (Task 5) với mỗi mục `{"id", "repo", "revision", "file", "bytes", "sha256", "license", "server_args": [str], "request_extra": {}}`.
- Produces: lệnh
  - `run_notes.py local --candidate <id> --config c8k|c16k --hw gpu|cpu [--json-mode schema|prompt] [--filter <glob>] [--server <exe>] [--force]`
  - `run_notes.py cloud --provider openai|gemini --model <tên> [--filter <glob>] [--force]`
  - Mỗi bản chép lời `$DATA/set/<name>.jsonl` ra một file `$DATA/out/<system>/<name>.json`, `system` là `<id>-<config>-<hw>` hay `<provider>-<model>`. Khóa: `system`, `name`, `lang`, `load_ms`, `gen_ms`, `peak_rss_mib`, `job` (kết quả `run_job`, có `notes`), `lang_ok`, `usage: [{"prompt_tokens", "completion_tokens", "ms"}]`. File đã có thì bỏ qua trừ khi `--force`.

- [ ] **Step 1: Hằng số cấu hình**

| Cấu hình | `-c` | `budget` | `max_map` | `max_reduce` |
|---|---|---|---|---|
| `c8k` | 8192 | 5000 | 800 | 1500 |
| `c16k` | 16384 | 12000 | 1200 | 2000 |
| cloud | — | 60000 | 4000 | 4000 |

Ngôn ngữ ghi chú lấy từ tên file: `vi-*` → `en`, còn lại → `vi`.

- [ ] **Step 2: Backend local.** Mỗi bản chép lời một tiến trình (khởi động, chạy, tắt), để `load_ms` có trong tổng như app sẽ làm.
  - Lệnh chạy, giống `pipeline::llama::command`: `<server> -m $DATA/models/<file> --host 127.0.0.1 --port <cổng trống> -c <ctx> -np 1 --no-slots --no-ui`, cộng `-ngl auto` (gpu) hay `-ngl 0 --device none` (cpu), cộng `server_args`. `--server` mặc định `$W/tools/llama-b11146/win-vulkan-x64/llama-server.exe`.
  - `load_ms`: từ lúc spawn tới khi `GET /health` trả `{"status": "ok"}` (chờ tối đa 300 s).
  - `count_tokens`: `POST /tokenize {"content": text}` → độ dài `tokens`.
  - `call`: `POST /v1/chat/completions`, không stream, `temperature` 0, `max_tokens`, timeout 1800 s, cộng `request_extra`. `--json-mode schema` (mặc định) thêm `"response_format": {"type": "json_schema", "json_schema": {"name": "notes", "schema": <schema.json>}}`; `prompt` thì không thêm gì.
  - `peak_rss_mib`: một luồng lấy `psutil.Process(pid).memory_info().rss` mỗi giây, giữ số lớn nhất, đổi ra MiB.
  - `finally`: `terminate()`, chờ 10 s, rồi `kill()`.

- [ ] **Step 3: Backend cloud.** `count_tokens = len(text) // 2`. `load_ms = 0`, `peak_rss_mib = None`.
  - `openai`: `POST https://api.openai.com/v1/chat/completions`, `Authorization: Bearer $OPENAI_API_KEY`, thân `{"model", "messages", "temperature": 0, "max_tokens", "response_format": {"type": "json_object"}}`.
  - `gemini`: API gốc (lớp tương thích OpenAI có lỗi timeout 10 giây, xem chú thích ở `src-tauri/src/cloud_mt.rs` `build_gemini_native_body`): `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`, header `x-goog-api-key: $GEMINI_API_KEY`, thân `{"contents": [{"role": "user" | "model", "parts": [{"text"}]}], "generationConfig": {"temperature": 0, "maxOutputTokens", "responseMimeType": "application/json"}}`; chữ trả về là nối các `candidates[0].content.parts[].text`.
  - Thiếu biến môi trường → dừng với lời báo rõ, không gọi mạng. Timeout 120 s. Không in key, không ghi header ra file.

- [ ] **Step 4: Kiểm bằng tay với server giả của repo.** Run: `cd $B && $PY -I run_notes.py local --help && $PY -m unittest test_notes_lib test_run_notes`
Expected: in đủ các cờ ở trên; 17 test `OK` (phần mạng kiểm ở Task 5 Step 4 với model thật).

- [ ] **Step 5: Commit** `git commit -am "bench(notes): backend local và cloud"`.

---

### Task 5: Chốt ứng viên, tải, nạp thử trên b11146

**Files:** tạo `$B/candidates.json`, `$B/results/ung-vien.md`

- [ ] **Step 1: Lập danh sách.** Bắt đầu từ ba họ tìm được ngày 2026-11-11: **Qwen3.5-4B**, **Gemma 4 E4B**, **Qwen3-4B**. Với mỗi họ, mở model card chính thức và kiểm, ghi vào `results/ung-vien.md`:
  - giấy phép cho phép phân phối lại bản đã lượng tử hóa (ghi tên giấy phép);
  - có bản instruct ổn định mới hơn trong cùng họ không (có thì thay);
  - file GGUF Q4_K_M ≤ 4 GiB (lớn hơn thì loại: không thể đạt RAM đỉnh ≤ 6 GiB cùng context);
  - cách tắt chế độ suy nghĩ, nếu model có.
  Giữ 2–3 ứng viên. Ưu tiên GGUF do chính tổ chức phát hành model đăng; dùng bản của bên thứ ba thì ghi rõ "chỉ để đo".

- [ ] **Step 2: Tải vào `$DATA/models/` và ghi `candidates.json`.** Mỗi ứng viên: `id` (chữ thường, gạch nối), `repo`, `revision` (mã commit của repo trên Hugging Face), `file`, `bytes`, `sha256` (`sha256sum`), `license`, `server_args` và `request_extra` (cờ tắt suy nghĩ theo model card; không cần thì `[]` và `{}`).

- [ ] **Step 3: Nạp thử từng ứng viên trên b11146.** Run (mỗi `<id>`): `cd $B && echo '{"seq":1,"t":0,"speaker":"Lan","src":"We agreed to ship on Friday. Minh will send the report by Thursday.","tgt":"Chúng ta thống nhất phát hành vào thứ Sáu. Minh sẽ gửi báo cáo trước thứ Năm.","dropped":false}' > $DATA/set/en-thu-1.jsonl && $PY -I run_notes.py local --candidate <id> --config c8k --hw cpu --filter 'en-thu-*' --force && $PY -c "import json;d=json.load(open(r'$DATA/out/<id>-c8k-cpu/en-thu-1.json'));print(d['load_ms'],d['job']['calls'],d['lang_ok'],d['job']['notes'])"`
Expected: `calls` có `valid: True`; ghi chú tiếng Việt có một quyết định và một việc cần làm của Minh. Ghi kết quả vào `results/ung-vien.md`.

- [ ] **Step 4: Xử lý ứng viên không chạy.**
  - Server báo lỗi `response_format`: chạy lại với `--json-mode prompt`, ghi vào `ung-vien.md`; mọi lượt sau của ứng viên đó dùng `prompt`.
  - Server không nạp được model (kiến trúc lạ): ghi `nạp lỗi trên b11146` kèm dòng lỗi, loại ứng viên khỏi Task 7.
  - **Không ứng viên nào nạp được:** tải bản phát hành ổn định mới nhất của llama.cpp cho Windows (Vulkan và CPU) vào `$DATA/llama-moi/` (không đụng `tools/`), ghi số bản, chạy lại Step 3 với `--server`. Mọi kết quả về sau ghi rõ binary nào. Đây là dữ kiện cho rủi ro 1 của spec §11.

- [ ] **Step 5: Xóa file thử, commit.** `rm $DATA/set/en-thu-1.jsonl && cd $W && git add bench/2026-11-11-ghi-chu-cuoc-hop && git commit -m "bench(notes): ứng viên model ghi chú"`

---

### Task 6: Bộ thử từ chính app **(cần chủ dự án)**

**Files:** tạo `$B/build_set.py`, `$B/results/bo-thu.md`

**Interfaces (Produces):** 20 file `$DATA/set/<lang>-<gói>-<phút>.jsonl` (mỗi dòng một câu theo Task 1): `{en,zh,ja,ko,vi}-chuan-{10,30,60}` và `{en,zh,ja,ko,vi}-nhe-30`.

- [ ] **Step 1: Chủ dự án chọn năm bản ghi.** Mỗi tiếng (en, zh, ja, ko, vi) một bản ghi công khai dài ≥ 60 phút, là cuộc họp thật có từ ba người nói, có quyết định và phân việc. Ghi URL, thời lượng vào `results/bo-thu.md`.

- [ ] **Step 2: Thu bản chép lời bằng bản dev của app.** Với mỗi tiếng, hai lượt:
  - Lượt Chuẩn: gói Chuẩn, Nguồn dịch là Model trên máy, ngôn ngữ đích Tiếng Việt (bản ghi tiếng Việt: đích English), giao diện Tiếng Việt, phát 60 phút đầu qua âm thanh máy, dừng, Xuất Markdown → `$DATA/raw/<lang>-chuan.md`.
  - Lượt Nhẹ: như trên với gói Nhẹ, 30 phút đầu → `$DATA/raw/<lang>-nhe.md`.
  Bản dev cần `AI_TRANSLATOR_DEV_PRO=true` trong `.env` để xuất file. Tổng thời gian phát: 7,5 giờ.

- [ ] **Step 3: Viết `build_set.py`.** Đọc mười file `raw`, `parse_markdown_export`, ghi `prefix(lines, 10)`, `prefix(lines, 30)`, `prefix(lines, 60)` cho file `chuan` và `prefix(lines, 30)` cho file `nhe`. In mỗi file: số câu, số câu `dropped`, số câu không có bản dịch.

- [ ] **Step 4: Chạy và ghi bảng.** Run: `cd $B && $PY -I build_set.py $DATA/raw $DATA/set && ls $DATA/set | wc -l`
Expected: `20`. Chép bảng số câu vào `results/bo-thu.md`. File nào dưới 30 câu là thu hỏng: thu lại.

- [ ] **Step 5: Commit** (chỉ `build_set.py` và `results/bo-thu.md`).

---

### Task 7: Chạy ứng viên local và chấm tự động

**Files:** tạo `$B/score_auto.py`, `$B/results/tu-dong.md`

**Interfaces (Produces):** `score_auto.py $DATA/out > results/tu-dong.md`: mỗi `system` một dòng: số bản chép lời; tỉ lệ lượt gọi `valid` (JSON hợp lệ sau ≤ 1 lần thử lại); số lượt `reduce_fallback`, `failed_chunks`, `raw_fallback`; tỉ lệ `refs` tồn tại (`1 − refs_invalid / refs_total`); số bản `lang_ok`; `load_ms + gen_ms` lớn nhất trên năm bản `*-chuan-60` (giây); `peak_rss_mib` lớn nhất; cột **Cổng** = `đạt` khi JSON ≥ 98%, `lang_ok` đủ mọi bản, và thời gian, RAM trong ngưỡng của `hw` đó (gpu ≤ 180 s; cpu ≤ 600 s và ≤ 6144 MiB).

- [ ] **Step 1: Lượt GPU, cả bộ thử, hai cấu hình.** Run (mỗi ứng viên còn lại sau Task 5): `cd $B && for c in c8k c16k; do $PY -I run_notes.py local --candidate <id> --config $c --hw gpu; done`
Expected: 20 file trong mỗi `$DATA/out/<id>-<c>-gpu/`. Máy không có GPU dùng được (Task 0): bỏ step này.

- [ ] **Step 2: Lượt CPU, năm bản 60 phút, hai cấu hình.** Run: `cd $B && for c in c8k c16k; do $PY -I run_notes.py local --candidate <id> --config $c --hw cpu --filter '*-chuan-60'; done`
Đóng app nặng khác trong lúc đo; ghi vào `results/may-do.md` nếu máy không rảnh. Máy không có GPU: chạy cả bộ thử ở CPU (bỏ `--filter`).

- [ ] **Step 3: Viết `score_auto.py`, chạy.** Run: `cd $B && $PY -I score_auto.py $DATA/out > results/tu-dong.md && cat results/tu-dong.md`
Expected: bảng có đủ các `system` đã chạy.

- [ ] **Step 4: Chọn hệ vào vòng chấm tay.** Mỗi ứng viên: lấy cấu hình có cột Cổng `đạt` ở cả gpu và cpu; cả hai cấu hình đều đạt thì lấy cấu hình có thời gian CPU nhỏ hơn. Ứng viên không có cấu hình nào đạt thì loại. Ghi lựa chọn và lý do vào cuối `results/tu-dong.md`. **Không còn ứng viên nào:** sang thẳng Task 10 với kết luận "không đạt".

- [ ] **Step 5: Commit** `score_auto.py` và `results/tu-dong.md`.

---

### Task 8: Mốc cloud **(cần chủ dự án)**

**Files:** sửa `$B/results/tu-dong.md`

- [ ] **Step 1: Xin phép và key.** Hỏi chủ dự án: đồng ý gửi chữ của 20 bản chép lời (nguồn công khai) tới OpenAI và Google; đặt `OPENAI_API_KEY`, `GEMINI_API_KEY` trong phiên shell. Tên model lấy từ giá trị mặc định của `openai_model` và `gemini_model` trong `src-tauri/src/settings/mod.rs` (lúc viết kế hoạch: `gpt-4o-mini`, `gemini-3.1-flash-lite`).

- [ ] **Step 2: Chạy.** Run: `cd $B && $PY -I run_notes.py cloud --provider openai --model <openai_model> && $PY -I run_notes.py cloud --provider gemini --model <gemini_model>`
Expected: 20 file mỗi hệ. Model trả 404 (đã ngừng): dừng, báo chủ dự án; đây cũng là việc của kế hoạch 02.

- [ ] **Step 3: Chấm tự động lại, commit.** Run lại lệnh Task 7 Step 3. Expected: thêm hai dòng cloud.

---

### Task 9: Chấm tay **(cần chủ dự án)** và khóa `notes` của manifest

**Files:** tạo `$B/grading.py`, `$B/test_grading.py`, `$B/results/cham-tay.md`; sửa `src-tauri/src/models/manifest.rs` (phần test)

**Interfaces (Produces):**
- `grading.py make $DATA/out $DATA/set $DATA/grading --systems <a,b,…>`: mỗi bản chép lời một file `$DATA/grading/<name>.csv` (UTF-8 có BOM để Excel đọc), cột `he, loai, text, owner, due, refs, bang_chung, dung, refs_dung, nhom`. `he` là mã chữ cái xáo ngẫu nhiên theo từng bản chép lời; bảng giải mã ở `$DATA/grading/key.json`. `bang_chung` là các câu được `refs` trỏ tới (dựng bằng `render_lines`). Ba cột cuối để trống.
- `grading.py score $DATA/grading` in bảng Markdown; dùng `score(rows: list[dict], key: dict) -> dict[str, dict]` trả mỗi hệ `{"bia": int, "refs_dung": float, "recall": float, "items": int}`.

- [ ] **Step 1: Viết test đỏ cho `score`**

```python
KEY = {"t1": {"A": "local", "B": "cloud"}}
def row(he, loai, dung, refs_dung, nhom, refs="1"):
    return {"name": "t1", "he": he, "loai": loai, "refs": refs, "dung": dung, "refs_dung": refs_dung, "nhom": nhom}
ROWS = [row("A", "action", "1", "1", "1"), row("A", "action", "0", "", ""), row("A", "decision", "1", "0", ""),
        row("B", "action", "1", "1", "1"), row("B", "action", "1", "1", "2")]

class Score(unittest.TestCase):
    def test_score(self):
        s = score(ROWS, KEY)
        self.assertEqual((s["local"]["bia"], s["cloud"]["bia"]), (1, 0))
        self.assertEqual((s["local"]["refs_dung"], s["cloud"]["refs_dung"]), (0.5, 1.0))
        self.assertEqual((s["local"]["recall"], s["cloud"]["recall"]), (0.5, 1.0))
    def test_blank_grade_is_an_error(self):
        with self.assertRaises(ValueError):
            score([row("A", "action", "", "", "")], KEY)
```

- [ ] **Step 2: Chạy, thấy đỏ; viết `grading.py`; chạy lại, xanh.** Run: `cd $B && $PY -m unittest test_grading -v`. Luật của `score`:
  - `bia`: số mục `loai == "action"` có `dung == "0"`.
  - `refs_dung`: trong các mục `dung == "1"` có `refs` khác rỗng, tỉ lệ `refs_dung == "1"`.
  - `recall`: mỗi bản chép lời, số `nhom` khác nhau của hệ (mục `action`, `dung == "1"`) chia số `nhom` khác nhau của mọi hệ; lấy trung bình các bản chép lời có ít nhất một `nhom`.
  - Ô `dung` trống, hay mục `action` có `dung == "1"` mà `nhom` trống → `ValueError` nêu file và dòng.

- [ ] **Step 3: Dựng phiếu.** Run: `cd $B && $PY -I grading.py make $DATA/out $DATA/set $DATA/grading --systems <các hệ của Task 7 Step 4>,<hai hệ cloud>`
Expected: 20 file CSV và `key.json`.

- [ ] **Step 4: Chủ dự án chấm (không mở `key.json`).** Mỗi dòng: `dung` = 1 nếu nội dung mục có thật trong lời thoại, 0 nếu không; `refs_dung` = 1 nếu các câu ở `bang_chung` đúng là chỗ nói điều đó (chỉ điền khi `dung` = 1 và có `refs`); `nhom`: với việc cần làm đúng, cùng một việc ở các hệ khác nhau thì ghi cùng một số.

- [ ] **Step 5: Chấm phiếu.** Run: `cd $B && $PY -I grading.py score $DATA/grading > results/cham-tay.md`
Expected: mỗi hệ một dòng. Cổng chấm tay của hệ local: `bia` ≤ 2 (trên 20 bản chép lời) và `refs_dung` ≥ 0,90.

- [ ] **Step 6: Test manifest.** Thêm vào `mod tests` của `src-tauri/src/models/manifest.rs`, ngay sau `a_speaker_entry_at_the_root_does_not_break_this_app`:

```rust
/// Spec 2026-11-11-ghi-chu-cuoc-hop §4: gói ghi chú đi ở khóa mới `notes` ở gốc phần thân; app chưa biết khóa này
/// (0.6.16 trở về trước) vẫn đọc được manifest và các gói như cũ.
#[test]
fn a_notes_entry_at_the_root_does_not_break_this_app() {
    let mut value = sample();
    value["notes"] = json!({
        "id": "notes-model", "version": "1", "file": "notes-model.gguf", "url": "files/notes-model.gguf",
        "bytes": 2_600_000_000u64, "sha256": "ef".repeat(32), "license_id": "Apache-2.0",
        "min_app_version": "0.7.0", "min_ram_mib": 15360, "ctx": 8192
    });
    let m = parse(&value).unwrap();
    assert_eq!(m.files_of("standard").len(), 4);
}
```

Run: `cd $W && cargo test -p meeting-translator --lib models::manifest 2>&1 | tail -3`
Expected: `ok`, test mới xanh ngay (test ghi nhận hành vi sẵn có). Đỏ thì dừng: gói ghi chú không đi được ở khóa gốc, báo chủ dự án.

- [ ] **Step 7: Commit** `grading.py`, `test_grading.py`, `results/cham-tay.md`, `manifest.rs`.

---

### Task 10: Tổng hợp, ghi vào spec, xin duyệt

**Files:** tạo `$B/README.md`, `$B/results/tong-hop.md`; sửa `docs/superpowers/specs/2026-11-11-ghi-chu-cuoc-hop-design.md`

- [ ] **Step 1: `README.md`**: điều kiện đo (máy, số bản `uv`, Python, `psutil`, binary `llama-server`), cách chạy lại từng script, vị trí dữ liệu ngoài repo, test (`$PY -m unittest test_notes_lib test_run_notes test_grading`).

- [ ] **Step 2: `results/tong-hop.md`**: một bảng, mỗi hệ một dòng, đủ năm ngưỡng của spec và ngưỡng ngôn ngữ, cộng `recall` (không có ngưỡng). Dưới bảng:
  - **Model chọn:** trong các hệ local qua mọi cổng, lấy `bia` nhỏ nhất; bằng nhau thì `recall` lớn nhất; còn bằng thì thời gian CPU nhỏ nhất.
  - Tham số chốt: `repo`, `revision`, `file`, `bytes`, `sha256`, giấy phép, cấu hình (`ctx`, `budget`, `max_map`, `max_reduce`), `json-mode`, `server_args`, `request_extra`, binary `llama-server` (b11146 hay bản riêng).
  - So với mốc cloud: chênh `bia`, `refs_dung`, `recall`.
  - Phần chưa đo: GPU hay CPU nào thiếu máy; kết quả gói Nhẹ so với gói Chuẩn (rủi ro 4 của spec).
  - **Không hệ local nào đạt:** ghi rõ cổng nào rớt, bằng bao nhiêu; không chọn model.

- [ ] **Step 3: Sửa spec.** Thêm mục "10.1 Kết quả (ngày đo)" với bảng tóm tắt và tham số chốt; sửa §11.1 theo binary thực dùng; sửa §9 cho khớp chữ thực gửi đi ("bản dịch của từng câu, hay câu gốc khi câu không có bản dịch, và nhãn người nói"); thêm ngưỡng ngôn ngữ vào §10.

- [ ] **Step 4: Commit, rồi dừng xin duyệt.** `git commit -am "docs(notes): kết quả đo model ghi chú và tham số chốt"`. Báo chủ dự án: model chọn (hay "không đạt", khi đó hỏi lại quyết định G3 của spec), các phần chưa đo, và việc kế tiếp là viết kế hoạch 03.
