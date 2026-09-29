# Giai đoạn 0 · 02: S4 (chat template) và S7 phần dịch (A3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:**
- Xác nhận `llama-server` b11146 dùng đúng chat template trong GGUF của Hy-MT2 qua `/v1/chat/completions` ở chế độ stream (S4, giả định 3).
- Lấy mốc COMET A3 cho Q8_0 và Q4_K_M.
- Kiểm giả định 6 (Q4_K_M so với Q8_0).
- Quyết định cờ ngữ cảnh câu trước.
- Lấy ngưỡng tỉ lệ token cho hậu xử lý (§6.5).

**Kiến trúc:**
- Các script Python trong `bench/phase0/mt/` chạy `llama-server` đúng như app: cùng cờ dòng lệnh, cùng tham số sinh, cùng mẫu prompt với `crates/pipeline/src/prompt.rs` (viết ở kế hoạch 06).
- Bản dịch lưu ở `bench/phase0/data/mt/outputs/` (không commit).
- COMET chạy trong môi trường uv riêng, vì `unbabel-comet` 2.2.7 bắt buộc numpy < 2 và transformers < 5.
- Kết quả nhỏ commit vào `bench/phase0/results/`.

**Công nghệ:** Python 3 (thư viện chuẩn) cho phần dịch; uv với Python 3.12 cho transformers 5.17.0 + jinja2 3.1.6 (S4) và unbabel-comet 2.2.7 (S7); llama.cpp b11146; Hy-MT2-1.8B GGUF.

Tổng quan: `docs/superpowers/plans/2026-09-29-giai-doan-0-00-tong-quan.md`. Cần làm xong kế hoạch 01 (có `models/` và `tools/llama-b11146/`). Chạy trên Mac. Kết quả chất lượng không phụ thuộc máy, nhưng Metal, Vulkan và CPU có thể cho bản dịch lệch nhau đôi chút, nên mốc A3 ghi rõ là đo trên Mac.

---

### Task 1: Gọi `llama-server` giống app

**Files:**
- Create: `bench/phase0/mt/common.py`

- [ ] **Step 1: Tạo `bench/phase0/mt/common.py`**

```python
"""Dùng chung cho S4 và S7: chạy llama-server đúng như app (spec §6.5) và dựng prompt.

Mẫu prompt phải giống hệt `crates/pipeline/src/prompt.rs`.
"""
import glob
import json
import os
import platform
import secrets
import socket
import subprocess
import time
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
EN_NAME = {"en": "English", "zh": "Chinese", "ja": "Japanese", "ko": "Korean", "vi": "Vietnamese"}
CN_NAME = {"en": "英语", "zh": "中文", "ja": "日语", "ko": "韩语", "vi": "越南语"}


def translation_prompt(text, src, tgt):
    if "zh" in (src, tgt):
        return f"将以下文本翻译为{CN_NAME[tgt]}，注意只需要输出翻译后的结果，不要额外解释：\n\n{text}"
    return (f"Translate the following text into {EN_NAME[tgt]}. Note that you should only output the translated "
            f"result without any additional explanation:\n\n{text}")


def context_prompt(text, context, src, tgt):
    if "zh" in (src, tgt):
        return f"【背景信息】\n{context}\n\n请结合背景信息将以下文本翻译为{CN_NAME[tgt]}。\n\n【待翻译文本】\n{text}"
    return (f"[Background Information]\n{context}\n\nPlease translate the following text into {EN_NAME[tgt]}, "
            f"taking the provided background information into consideration.\n\n[Source Text]\n{text}")


def find_llama_server():
    exe = "llama-server.exe" if platform.system() == "Windows" else "llama-server"
    variant = os.environ.get("LLAMA_VARIANT", "win-vulkan-x64" if platform.system() == "Windows" else "macos-arm64")
    hits = glob.glob(os.path.join(ROOT, "tools", "llama-b11146", variant, "**", exe), recursive=True)
    if not hits:
        raise SystemExit(f"không thấy {exe}; chạy bench/phase0/fetch.py --only llama trước")
    return hits[0]


class LlamaServer:
    """Lệnh chạy theo §6.5: -c 2048 -np 1 -ngl auto --no-webui, chỉ nghe 127.0.0.1, API key ngẫu nhiên."""

    def __init__(self, model, extra_args=(), log_path=None):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            self.port = s.getsockname()[1]
        self.key = secrets.token_hex(16)
        self.base = f"http://127.0.0.1:{self.port}"
        log = open(log_path or os.devnull, "w")
        cmd = [find_llama_server(), "-m", model, "--host", "127.0.0.1", "--port", str(self.port),
               "--api-key", self.key, "-c", "2048", "-np", "1", "-ngl", "auto", "--no-webui", *extra_args]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=log)
        deadline = time.time() + 180
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(f"llama-server thoát sớm (mã {self.proc.returncode}), xem log")
            try:
                with urllib.request.urlopen(f"{self.base}/health", timeout=2) as r:
                    if r.status == 200:
                        return
            except (urllib.error.URLError, ConnectionError, TimeoutError):
                pass
            time.sleep(0.2)
        raise RuntimeError("llama-server không sẵn sàng sau 180 giây")

    def _post(self, path, body):
        req = urllib.request.Request(f"{self.base}{path}", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json",
                                              "Authorization": f"Bearer {self.key}"})
        return urllib.request.urlopen(req, timeout=300)

    def chat(self, prompt, max_tokens=512, stream=False):
        """Tham số sinh theo §6.5. Trả (text, info) với info gồm thời gian và số token."""
        body = {"messages": [{"role": "user", "content": prompt}], "temperature": 0.0, "repeat_penalty": 1.05,
                "max_tokens": max_tokens, "cache_prompt": True, "stream": stream}
        started = time.perf_counter()
        with self._post("/v1/chat/completions", body) as r:
            if not stream:
                data = json.load(r)
                t = data.get("timings", {})
                return data["choices"][0]["message"]["content"].strip(), {
                    "total_ms": (time.perf_counter() - started) * 1000,
                    "prompt_tokens": data["usage"]["prompt_tokens"],
                    "completion_tokens": data["usage"]["completion_tokens"],
                    "prompt_ms": t.get("prompt_ms"), "predicted_ms": t.get("predicted_ms")}
            text, first = "", None
            for raw in r:
                line = raw.decode("utf-8").strip()
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                delta = json.loads(payload)["choices"][0]["delta"].get("content") or ""
                if delta and first is None:
                    first = (time.perf_counter() - started) * 1000
                text += delta
            total = (time.perf_counter() - started) * 1000
            return text.strip(), {"total_ms": total, "first_token_ms": first if first is not None else total}

    def completion(self, raw_prompt, max_tokens=512):
        body = {"prompt": raw_prompt, "n_predict": max_tokens, "temperature": 0.0, "repeat_penalty": 1.05,
                "cache_prompt": True}
        with self._post("/completion", body) as r:
            return json.load(r)["content"].strip()

    def apply_template(self, prompt):
        with self._post("/apply-template", {"messages": [{"role": "user", "content": prompt}]}) as r:
            return json.load(r)["prompt"]

    def count_tokens(self, text):
        with self._post("/tokenize", {"content": text}) as r:
            return len(json.load(r)["tokens"])

    def close(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
```

- [ ] **Step 2: Kiểm tra mẫu prompt khớp spec §6.5**

Run:
```bash
(cd bench/phase0/mt && python3 -c "
from common import translation_prompt as t, context_prompt as c
assert t('Hi', 'en', 'vi') == 'Translate the following text into Vietnamese. Note that you should only output the translated result without any additional explanation:\n\nHi'
assert t('你好', 'zh', 'vi') == '将以下文本翻译为越南语，注意只需要输出翻译后的结果，不要额外解释：\n\n你好'
assert t('Xin chào', 'vi', 'zh').startswith('将以下文本翻译为中文')
assert t('Xin chào', 'vi', 'ja').startswith('Translate the following text into Japanese.')
assert c('B', 'A', 'en', 'vi') == '[Background Information]\nA\n\nPlease translate the following text into Vietnamese, taking the provided background information into consideration.\n\n[Source Text]\nB'
print('ok')
")
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add bench/phase0/mt/common.py
git commit -m "feat(bench): chạy llama-server và dựng prompt Hy-MT2 giống app"
```

### Task 2: S4, kiểm tra chat template

**Files:**
- Create: `bench/phase0/mt/check_template.py`
- Create: `bench/phase0/results/s4_template_Hy-MT2-1.8B-Q8_0.json` (script sinh ra)
- Create: `bench/phase0/results/s4_template_Hy-MT2-1.8B-Q4_K_M.json` (script sinh ra)

Script so sánh hai điều:
- Prompt do `llama-server` dựng từ template trong GGUF (`/apply-template`) phải giống hệt prompt do tokenizer của Hugging Face dựng.
- Bản dịch stream qua `/v1/chat/completions` phải giống hệt bản dịch qua `/completion` với prompt của Hugging Face.

Nếu cả hai đều giống thì app không cần tự render template bằng `minijinja` (§6.5).

- [ ] **Step 1: Tạo `bench/phase0/mt/check_template.py`**

```python
"""Spike S4: llama-server dùng được chat template trong GGUF của Hy-MT2 qua /v1/chat/completions (giả định 3, §14).

Kiểm tra:
1. Prompt do llama-server dựng (/apply-template) giống hệt chat template của tokenizer trên Hugging Face.
2. Bản dịch stream qua /v1/chat/completions giống hệt bản dịch /completion với prompt dựng bằng tokenizer.

Dùng (môi trường có transformers 5.x, model card Hy-MT2 yêu cầu transformers ≥ 5.6):
  uv run --python 3.12 --with "transformers==5.17.0" --with "jinja2==3.1.6" \
    python bench/phase0/mt/check_template.py --model models/Hy-MT2-1.8B-Q8_0.gguf
Kết quả: bench/phase0/results/s4_template_<model>.json; log của llama-server ở bench/phase0/data/.
"""
import argparse
import json
import os

from common import ROOT, LlamaServer, translation_prompt
from transformers import AutoTokenizer

CASES = [
    ("en", "vi", "Could you share the latest version of the report after the meeting?"),
    ("zh", "vi", "我们下周需要完成新产品的测试。"),
    ("ja", "vi", "来月の予算について、もう一度確認させてください。"),
    ("ko", "vi", "회의가 끝나면 보고서 최신 버전을 공유해 주시겠어요?"),
    ("vi", "en", "Chúng ta cần chốt ngân sách trước thứ Sáu tuần này."),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    args = ap.parse_args()
    tok = AutoTokenizer.from_pretrained("tencent/Hy-MT2-1.8B")
    stem = os.path.basename(args.model).removesuffix(".gguf")
    log_dir = os.path.join(ROOT, "bench", "phase0", "data")
    os.makedirs(log_dir, exist_ok=True)
    rows, ok = [], True
    with LlamaServer(args.model, log_path=os.path.join(log_dir, f"s4_{stem}.llama.log")) as server:
        for src, tgt, text in CASES:
            prompt = translation_prompt(text, src, tgt)
            hf_prompt = tok.apply_chat_template([{"role": "user", "content": prompt}],
                                                add_generation_prompt=True, tokenize=False)
            server_prompt = server.apply_template(prompt)
            streamed, timing = server.chat(prompt, stream=True)
            direct = server.completion(hf_prompt)
            row = {"dir": f"{src}->{tgt}", "template_equal": server_prompt == hf_prompt,
                   "stream_equals_completion": streamed == direct, "translation": streamed, **timing}
            if not row["template_equal"]:
                row["server_prompt"], row["hf_prompt"] = server_prompt, hf_prompt
            ok &= row["template_equal"] and row["stream_equals_completion"]
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False))
    out = os.path.join(ROOT, "bench", "phase0", "results", f"s4_template_{stem}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"model": os.path.basename(args.model), "pass": ok, "cases": rows}, f, ensure_ascii=False, indent=1)
    print("S4", "ĐẠT" if ok else "KHÔNG ĐẠT", "->", out)
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Chạy với Q8_0**

Run:
```bash
uv run --no-project --python 3.12 --with "transformers==5.17.0" --with "jinja2==3.1.6" \
  python bench/phase0/mt/check_template.py --model models/Hy-MT2-1.8B-Q8_0.gguf
```
Expected:
- Có thể có dòng cảnh báo `[transformers] Unrecognized keys in rope_parameters…`; bỏ qua được, vì script chỉ dùng tokenizer.
- Năm dòng JSON (`en->vi`, `zh->vi`, `ja->vi`, `ko->vi`, `vi->en`), mỗi dòng có `"template_equal": true, "stream_equals_completion": true`.
- Dòng cuối: `S4 ĐẠT -> …/bench/phase0/results/s4_template_Hy-MT2-1.8B-Q8_0.json`.
- Mã thoát 0.

Lần chạy trước trên M4 Pro (với Q4_K_M), bản dịch `en->vi` là "Bạn có thể chia sẻ phiên bản mới nhất của báo cáo sau cuộc họp không?".

- [ ] **Step 3: Chạy với Q4_K_M**

Run:
```bash
uv run --no-project --python 3.12 --with "transformers==5.17.0" --with "jinja2==3.1.6" \
  python bench/phase0/mt/check_template.py --model models/Hy-MT2-1.8B-Q4_K_M.gguf
```
Expected: như Step 2, dòng cuối là `S4 ĐẠT -> …/s4_template_Hy-MT2-1.8B-Q4_K_M.json`.

Nếu có ca `template_equal: false`:
- File JSON có thêm `server_prompt` và `hf_prompt`. So sánh hai chuỗi này để tìm chỗ lệch.
- Ghi lại lỗi trong `bench/phase0/results/s4_template_notes.md`.
- Đổi cách gọi ở §6.5 sang render bằng `minijinja` rồi gọi `/completion`. Việc này làm ở Task 2 của file tổng quan.

- [ ] **Step 4: Commit**

```bash
git add bench/phase0/mt/check_template.py bench/phase0/results/s4_template_*.json
git commit -m "test(bench): S4 kiểm tra chat template Hy-MT2 trên llama-server b11146"
```

### Task 3: Dựng bộ test A3

**Files:**
- Create: `bench/phase0/mt/build_testset.py`
- Create: `bench/phase0/data/mt/testset_phase0.jsonl` (script sinh ra, không commit)

Theo A3, bộ test gồm hai phần:
- Bộ benchmark 2026-09-29: 320 câu có bản tham chiếu.
- Ba chiều Trung/Nhật/Hàn→Việt, mỗi chiều 100 câu mới từ WMT24++ (Apache-2.0), không trùng các đoạn đã dùng.

Script dựng lại đúng thứ tự xáo của `bench/2026-09-29-mt-benchmark/prep_data.py`: seed 2026, 240 đoạn đầu đã dùng, nên các đoạn mới lấy từ vị trí 240 tới 339.

- [ ] **Step 1: Tạo `bench/phase0/mt/build_testset.py`**

```python
"""Dựng bộ test cho A3 ở S7: bộ benchmark 2026-09-29 + Trung/Nhật/Hàn→Việt (mỗi chiều 100 câu mới).

- Bộ cũ: giữ nguyên 320 câu có bản tham chiếu (Anh→Việt 100, Việt→Anh 100, Việt→Trung/Nhật/Hàn mỗi chiều 40),
  để so được với mốc cũ. Bỏ 12 câu đời thường không có bản tham chiếu, vì COMET cần bản tham chiếu.
- Trung/Nhật/Hàn→Việt: 100 đoạn WMT24++ khác hẳn 240 đoạn benchmark cũ đã dùng; câu nguồn là bản dịch
  chuẩn tiếng Trung/Nhật/Hàn, bản tham chiếu là bản dịch chuẩn tiếng Việt của cùng đoạn.
- Trường `context`: câu liền trước trong cùng tài liệu, bằng ngôn ngữ nguồn, cho thí nghiệm cờ ngữ cảnh (§6.5).

Dùng: python3 bench/phase0/mt/build_testset.py
"""
import json
import os
import random
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OLD = os.path.join(ROOT, "bench", "2026-09-29-mt-benchmark")
DATA = os.path.join(ROOT, "bench", "phase0", "data", "mt")
BASE = "https://huggingface.co/datasets/google/wmt24pp/resolve/main/"
FILES = {"vi": "en-vi_VN", "zh": "en-zh_CN", "ja": "en-ja_JP", "ko": "en-ko_KR"}
N_NEW = 100


def load(lang):
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, FILES[lang] + ".jsonl")
    if not os.path.exists(path):
        urllib.request.urlretrieve(BASE + FILES[lang] + ".jsonl", path)
    with open(path, encoding="utf-8") as f:
        return {r["segment_id"]: r for r in map(json.loads, f)}


def main():
    data = {lang: load(lang) for lang in FILES}
    # Dựng lại đúng pool và thứ tự xáo của prep_data.py (2026-09-29) để không trùng 240 đoạn đã dùng.
    common = set.intersection(*(set(d) for d in data.values()))

    def usable(seg):
        rows = [data[lang][seg] for lang in FILES]
        if any(r["is_bad_source"] or r["domain"] == "canary" for r in rows):
            return False
        return 15 <= len(rows[0]["source"]) <= 250 and len(data["vi"][seg]["target"]) <= 300

    pool = sorted(s for s in common if usable(s))
    random.Random(2026).shuffle(pool)
    new_segments = pool[240:240 + N_NEW]

    def previous(lang, seg, field):
        """Câu liền trước trong cùng tài liệu, hoặc chuỗi rỗng."""
        row = data[lang][seg]
        prev = data[lang].get(seg - 1)
        if prev and prev["document_id"] == row["document_id"] and not prev["is_bad_source"]:
            return prev[field]
        return ""

    items = []
    with open(os.path.join(OLD, "testset.jsonl"), encoding="utf-8") as f:
        for it in map(json.loads, f):
            if not it["ref"]:
                continue
            seg = int(it["id"].split("-")[-1])  # segment_id của WMT24++ là số nguyên
            # File en-vi_VN: `source` là câu tiếng Anh, `target` là câu tiếng Việt.
            field = "source" if it["src_lang"] == "en" else "target"
            items.append({**it, "context": previous("vi", seg, field)})
    for src in ("zh", "ja", "ko"):
        for seg in new_segments:
            items.append({
                "id": f"{src}-vi-{seg}",
                "dir": f"{src}->vi",
                "src_lang": src,
                "tgt_lang": "vi",
                "domain": data["vi"][seg]["domain"],
                "src": data[src][seg]["target"],
                "ref": data["vi"][seg]["target"],
                "context": previous(src, seg, "target"),
            })
    out = os.path.join(DATA, "testset_phase0.jsonl")
    with open(out, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    from collections import Counter
    print("ghi", len(items), "câu ->", out)
    print(Counter(it["dir"] for it in items))
    print("có ngữ cảnh:", Counter(it["dir"] for it in items if it["context"]))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Chạy**

Run: `python3 bench/phase0/mt/build_testset.py`
Expected (tải 4 file WMT24++ khoảng 5 MB ở lần đầu):
```
ghi 620 câu -> …/bench/phase0/data/mt/testset_phase0.jsonl
Counter({'en->vi': 100, 'vi->en': 100, 'zh->vi': 100, 'ja->vi': 100, 'ko->vi': 100, 'vi->zh': 40, 'vi->ja': 40, 'vi->ko': 40})
có ngữ cảnh: Counter({'vi->en': 88, 'en->vi': 87, 'zh->vi': 85, 'ja->vi': 85, 'ko->vi': 85, 'vi->zh': 36, 'vi->ja': 36, 'vi->ko': 36})
```

- [ ] **Step 3: Commit**

```bash
git add bench/phase0/mt/build_testset.py
git commit -m "feat(bench): bộ test A3 gồm benchmark cũ và ba chiều Trung/Nhật/Hàn→Việt"
```

### Task 4: Dịch bộ test qua `llama-server`

**Files:**
- Create: `bench/phase0/mt/translate.py`

Mỗi model chạy hai lượt:
- `plain`: prompt mặc định của app, 620 câu.
- `context`: mẫu "background information" với câu liền trước, 538 câu có ngữ cảnh.

Tham số sinh theo §6.5, riêng số token tối đa để 512 (không áp công thức của app) để đo được độ dài tự nhiên của bản dịch.

- [ ] **Step 1: Tạo `bench/phase0/mt/translate.py`**

```python
"""S7: dịch bộ test qua đúng llama-server và prompt của app (spec A3, §6.5).

Dùng:
  python3 bench/phase0/mt/translate.py --model models/Hy-MT2-1.8B-Q8_0.gguf [--variant plain|context] [--limit N]
Kết quả: bench/phase0/data/mt/outputs/<model>-<variant>.jsonl, chạy lại thì tiếp tục từ câu chưa dịch.
"""
import argparse
import json
import os

from common import ROOT, LlamaServer, context_prompt, translation_prompt

DATA = os.path.join(ROOT, "bench", "phase0", "data", "mt")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--variant", choices=["plain", "context"], default="plain")
    ap.add_argument("--limit", type=int, default=0, help="chỉ dịch N câu đầu của mỗi chiều (chạy thử)")
    args = ap.parse_args()

    items = [json.loads(line) for line in open(os.path.join(DATA, "testset_phase0.jsonl"), encoding="utf-8")]
    if args.limit:
        counts, kept = {}, []
        for it in items:
            if counts.get(it["dir"], 0) < args.limit:
                kept.append(it)
                counts[it["dir"]] = counts.get(it["dir"], 0) + 1
        items = kept
    if args.variant == "context":
        items = [it for it in items if it["context"]]

    stem = os.path.basename(args.model).removesuffix(".gguf")
    out_dir = os.path.join(DATA, "outputs")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{stem}-{args.variant}.jsonl")
    done = set()
    if os.path.exists(out_path):
        done = {json.loads(line)["id"] for line in open(out_path, encoding="utf-8")}

    with LlamaServer(args.model, log_path=os.path.join(out_dir, f"{stem}.llama.log")) as server, \
            open(out_path, "a", encoding="utf-8") as out:
        server.chat(translation_prompt("Hello.", "en", "vi"), max_tokens=16)  # làm nóng
        todo = [it for it in items if it["id"] not in done]
        for n, it in enumerate(todo, 1):
            src, tgt = it["src_lang"], it["tgt_lang"]
            prompt = (context_prompt(it["src"], it["context"], src, tgt) if args.variant == "context"
                      else translation_prompt(it["src"], src, tgt))
            hyp, info = server.chat(prompt)
            row = {"id": it["id"], "dir": it["dir"], "hyp": hyp, "src_tokens": server.count_tokens(it["src"]), **info}
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            out.flush()
            if n % 25 == 0 or n == len(todo):
                print(f"{stem}-{args.variant}: {n}/{len(todo)}", flush=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Chạy thử 5 câu mỗi chiều**

Run: `python3 bench/phase0/mt/translate.py --model models/Hy-MT2-1.8B-Q4_K_M.gguf --limit 5`
Expected: dòng cuối là `Hy-MT2-1.8B-Q4_K_M-plain: 40/40`. File `bench/phase0/data/mt/outputs/Hy-MT2-1.8B-Q4_K_M-plain.jsonl` có 40 dòng, mỗi dòng có `hyp` không rỗng, `src_tokens`, `completion_tokens` và `total_ms`.

- [ ] **Step 3: Chạy đủ bốn lượt** (khoảng 15 phút trên M4 Pro; chạy tiếp từ các câu đã dịch)

Run:
```bash
for m in Q8_0 Q4_K_M; do for v in plain context; do
  python3 bench/phase0/mt/translate.py --model models/Hy-MT2-1.8B-$m.gguf --variant $v || break 2
done; done
wc -l bench/phase0/data/mt/outputs/*.jsonl
```
Expected:
- Mỗi lượt in tiến độ 25 câu một lần.
- `wc -l` ra 620 dòng cho mỗi file `-plain.jsonl` và 538 dòng cho mỗi file `-context.jsonl`.

- [ ] **Step 4: Commit**

```bash
git add bench/phase0/mt/translate.py
git commit -m "feat(bench): dịch bộ test A3 qua llama-server với prompt của app"
```

### Task 5: Chấm COMET, so sánh theo cặp, ngưỡng tỉ lệ token

**Files:**
- Create: `bench/phase0/mt/score_mt.py`
- Create: `bench/phase0/results/s7_mt.json`, `bench/phase0/results/s7_mt.md` (script sinh ra)

Script tính:
- COMET (`Unbabel/wmt22-comet-da`, giống benchmark cũ) theo từng lượt chạy và từng chiều.
- Mức sàn A3:
  - Anh→Việt: Q8_0 ≥ 0,83, Q4_K_M ≥ 0,80.
  - Trung/Nhật/Hàn→Việt: không thấp hơn Anh→Việt của cùng lượt quá 0,05.
- So sánh theo cặp trên cùng tập câu, có khoảng tin cậy 95% bằng bootstrap:
  - Q4_K_M so với Q8_0, cho giả định 6.
  - Có ngữ cảnh so với không, cho cờ ngữ cảnh.
- Cột "Số câu dài gấp đôi": số câu mà bản dịch có ngữ cảnh dài hơn gấp đôi bản không có ngữ cảnh. Khi câu gốc ngắn, model đôi khi dịch luôn cả câu ngữ cảnh.
- Ngưỡng tỉ lệ token: tỉ lệ lớn nhất đo được, cộng biên 25%, làm tròn lên 0,1. Chỉ lấy từ các lượt chạy không có ngữ cảnh.

- [ ] **Step 1: Tạo `bench/phase0/mt/score_mt.py`**

```python
"""S7: chấm COMET từng chiều, so sánh theo cặp và lấy ngưỡng tỉ lệ token cho hậu xử lý (spec A3, §6.5).

Dùng (môi trường COMET, xem kế hoạch 02):
  python bench/phase0/mt/score_mt.py            # COMET + tỉ lệ token
  python bench/phase0/mt/score_mt.py --no-comet # chỉ tỉ lệ token, không cần torch
Kết quả: bench/phase0/results/s7_mt.json và s7_mt.md.
"""
import argparse
import glob
import json
import math
import os
import random
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DATA = os.path.join(ROOT, "bench", "phase0", "data", "mt")
RESULTS = os.path.join(ROOT, "bench", "phase0", "results")
FLOOR = {"Q8_0": 0.83, "Q4_K_M": 0.80}  # mức sàn Anh→Việt (A3)
CJK_GAP = 0.05  # Trung/Nhật/Hàn→Việt thấp hơn Anh→Việt quá mức này thì xem lại D5 (A3)


def percentile(values, p):
    v = sorted(values)
    k = (len(v) - 1) * p / 100
    lo, hi = math.floor(k), math.ceil(k)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def mean(values):
    values = list(values)
    return sum(values) / len(values)


def bootstrap_ci(diffs, n_boot=2000):
    """Khoảng tin cậy 95% của chênh lệch trung bình theo cặp."""
    rng = random.Random(0)
    means = sorted(mean(rng.choices(diffs, k=len(diffs))) for _ in range(n_boot))
    return means[int(0.025 * n_boot)], means[int(0.975 * n_boot) - 1]


def summarize(rows, scores):
    ratios = [r["completion_tokens"] / max(r["src_tokens"], 1) for r in rows]
    out = {"n": len(rows), "token_ratio_max": max(ratios), "token_ratio_p99": percentile(ratios, 99),
           # Ngưỡng đề xuất: tỉ lệ lớn nhất đo được, cộng biên 25%, làm tròn lên 0,1.
           "proposed_threshold": math.ceil(max(ratios) * 1.25 * 10) / 10,
           "total_ms_p50": percentile([r["total_ms"] for r in rows], 50)}
    if scores:
        out["comet"] = mean(scores[r["id"]] for r in rows)
    return out


def compare(runs, scores, a, b):
    """So sánh lượt chạy a với b theo từng chiều, chỉ trên các câu có ở cả hai lượt."""
    by_dir = defaultdict(list)
    for i, r in runs[a].items():
        if i in runs[b]:
            by_dir[r["dir"]].append(i)
    out = {}
    for d, ids in sorted(by_dir.items()):
        ms_a = percentile([runs[a][i]["total_ms"] for i in ids], 50)
        ms_b = percentile([runs[b][i]["total_ms"] for i in ids], 50)
        row = {"n": len(ids), "ms_change": ms_a / ms_b - 1,
               # Bản dịch dài hơn gấp đôi lượt kia: dấu hiệu dịch luôn câu ngữ cảnh hoặc sinh lan man.
               "longer_x2": sum(runs[a][i]["completion_tokens"] > 2 * runs[b][i]["completion_tokens"] for i in ids)}
        if scores:
            diffs = [scores[a][i] - scores[b][i] for i in ids]
            row["comet_diff"] = mean(diffs)
            row["ci95"] = bootstrap_ci(diffs)
        out[d] = row
    return out


def floor_cell(name, d, per_dir):
    """Mức sàn A3, chỉ áp cho lượt chạy không có ngữ cảnh (cấu hình mặc định của app)."""
    quant = next((q for q in FLOOR if q in name), None)
    if not name.endswith("-plain") or quant is None:
        return "—"
    if d == "en->vi":
        floor = FLOOR[quant]
    elif d in ("zh->vi", "ja->vi", "ko->vi") and "comet" in per_dir["en->vi"]:
        floor = per_dir["en->vi"]["comet"] - CJK_GAP
    else:
        return "—"
    if "comet" not in per_dir[d]:
        return f"{floor:.3f} (?)"
    return f"{floor:.3f} ({'đạt' if per_dir[d]['comet'] >= floor else 'KHÔNG ĐẠT'})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-comet", action="store_true")
    args = ap.parse_args()
    items = {it["id"]: it for it in map(json.loads, open(os.path.join(DATA, "testset_phase0.jsonl"), encoding="utf-8"))}
    runs = {}
    for path in sorted(glob.glob(os.path.join(DATA, "outputs", "*.jsonl"))):
        name = os.path.basename(path).removesuffix(".jsonl")
        runs[name] = {r["id"]: r for r in map(json.loads, open(path, encoding="utf-8"))}
    if not runs:
        raise SystemExit("chưa có kết quả dịch; chạy translate.py trước")

    scores = {}
    if not args.no_comet:
        from comet import download_model, load_from_checkpoint
        model = load_from_checkpoint(download_model("Unbabel/wmt22-comet-da"))
        for name, rows in runs.items():
            ids = list(rows)
            data = [{"src": items[i]["src"], "mt": rows[i]["hyp"], "ref": items[i]["ref"]} for i in ids]
            # num_workers=1: với torch 2.x, num_workers=0 báo lỗi multiprocessing_context (benchmark 2026-09-29).
            pred = model.predict(data, batch_size=16, gpus=0, num_workers=1, progress_bar=False)
            scores[name] = dict(zip(ids, pred.scores))

    report = {}
    for name, rows in runs.items():
        by_dir = defaultdict(list)
        for r in rows.values():
            by_dir[r["dir"]].append(r)
        report[name] = {d: summarize(rs, scores.get(name)) for d, rs in sorted(by_dir.items())}

    # Giả định 6 (§14): Q4_K_M so với Q8_0. Cờ ngữ cảnh (§6.5): có ngữ cảnh so với không.
    comparisons = {}
    for name in runs:
        if "Q4_K_M" in name and name.replace("Q4_K_M", "Q8_0") in runs:
            comparisons[f"{name} − Q8_0"] = compare(runs, scores, name, name.replace("Q4_K_M", "Q8_0"))
        if name.endswith("-context") and name.removesuffix("-context") + "-plain" in runs:
            comparisons[f"{name} − plain"] = compare(runs, scores, name, name.removesuffix("-context") + "-plain")

    # Ngưỡng lấy từ lượt chạy không có ngữ cảnh (cấu hình mặc định). Có ngữ cảnh, model đôi khi dịch luôn câu
    # ngữ cảnh khi câu gốc ngắn; đó là lỗi mà ngưỡng phải cắt được, nên không đưa vào để tính ngưỡng.
    thresholds = defaultdict(float)
    for name, per_dir in report.items():
        if name.endswith("-plain"):
            for d, r in per_dir.items():
                thresholds[d] = max(thresholds[d], r["proposed_threshold"])

    os.makedirs(RESULTS, exist_ok=True)
    with open(os.path.join(RESULTS, "s7_mt.json"), "w", encoding="utf-8") as f:
        json.dump({"runs": report, "comparisons": comparisons, "token_ratio_thresholds": thresholds}, f,
                  ensure_ascii=False, indent=1)

    lines = ["## Mốc theo lượt chạy", "",
             "| Lượt chạy | Chiều | Số câu | COMET | Mức sàn (A3) | Tỉ lệ token lớn nhất | Ngưỡng đề xuất | p50 thời gian (ms) |",
             "|---|---|---|---|---|---|---|---|"]
    for name, per_dir in report.items():
        for d, r in per_dir.items():
            comet_s = f"{r['comet']:.3f}" if "comet" in r else "—"
            lines.append(f"| {name} | {d} | {r['n']} | {comet_s} | {floor_cell(name, d, per_dir)} | "
                         f"{r['token_ratio_max']:.2f} | {r['proposed_threshold']:.1f} | {r['total_ms_p50']:.0f} |")
    lines += ["", "## So sánh theo cặp (cùng tập câu)", "",
              "| So sánh | Chiều | Số câu | Chênh COMET | 95% CI | Chênh p50 thời gian | Số câu dài gấp đôi |",
              "|---|---|---|---|---|---|---|"]
    for label, per_dir in comparisons.items():
        for d, r in per_dir.items():
            diff_s = f"{r['comet_diff']:+.3f}" if "comet_diff" in r else "—"
            ci_s = f"[{r['ci95'][0]:+.3f}, {r['ci95'][1]:+.3f}]" if "ci95" in r else "—"
            lines.append(f"| {label} | {d} | {r['n']} | {diff_s} | {ci_s} | {r['ms_change']:+.0%} | {r['longer_x2']} |")
    lines += ["", "## Ngưỡng tỉ lệ token đề xuất cho §6.5 (từ các lượt chạy không có ngữ cảnh)", "",
              "| Chiều | Ngưỡng |", "|---|---|"]
    lines += [f"| {d} | {v:.1f} |" for d, v in sorted(thresholds.items())]
    with open(os.path.join(RESULTS, "s7_mt.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Chạy phần không cần COMET trước**

Run: `python3 bench/phase0/mt/score_mt.py --no-comet`
Expected: ba bảng Markdown.
- "Mốc theo lượt chạy": 32 dòng (4 lượt × 8 chiều), cột COMET là `—`.
- "So sánh theo cặp": 32 dòng.
- "Ngưỡng tỉ lệ token đề xuất": 8 dòng.

Lúc lập kế hoạch, Q4_K_M trên đủ 620 câu (M4 Pro) cho ngưỡng Anh→Việt 4,2, Trung→Việt 4,2, Nhật→Việt 3,4, Hàn→Việt 2,9, Việt→Anh 1,6, Việt→Nhật 2,2, Việt→Hàn 2,0, Việt→Trung 1,2. Các tỉ lệ lớn nhất (khoảng 3,3) là bản dịch đúng: câu tiếng Việt tốn nhiều token, nhất là khi dịch từ tiếng Trung.

- [ ] **Step 3: Chấm COMET** (lần đầu tải model COMET khoảng 2,3 GB vào `~/.cache/huggingface`)

Run:
```bash
uv run --no-project --python 3.12 --with "unbabel-comet==2.2.7" --with "numpy<2" \
  --with "transformers<5" --with "setuptools<82" python bench/phase0/mt/score_mt.py
```
Vì sao cần các ràng buộc này:
- unbabel-comet 2.2.7 kéo theo torchmetrics 0.10.3; bản này vẫn import `pkg_resources`, mà setuptools bỏ module đó từ bản 82, nên cần `setuptools<82`.
- `numpy<2` và `transformers<5` là yêu cầu của unbabel-comet 2.2.7.

Expected:
- Nhiều dòng cảnh báo của pytorch_lightning (`pkg_resources is deprecated`, `GPU available but not used`); bỏ qua được.
- Ba bảng như Step 2, nhưng cột COMET có số, và cột "Mức sàn (A3)" ghi `đạt` hoặc `KHÔNG ĐẠT`.
- Chấm bốn lượt mất khoảng 5 phút trên CPU của M4 Pro.
- Số đo lúc lập kế hoạch với Q4_K_M, lượt `plain`, M4 Pro:

  | Chiều | Anh→Việt | Trung→Việt | Nhật→Việt | Hàn→Việt | Việt→Anh | Việt→Trung | Việt→Nhật | Việt→Hàn |
  |---|---|---|---|---|---|---|---|---|
  | COMET | 0,841 | 0,831 | 0,815 | 0,822 | 0,822 | 0,821 | 0,845 | 0,842 |

- Để so sánh: benchmark cũ đo Hy-MT2 bản gốc được 0,840 cho Anh→Việt.

- [ ] **Step 4: Commit**

```bash
git add bench/phase0/mt/score_mt.py bench/phase0/results/s7_mt.json bench/phase0/results/s7_mt.md
git commit -m "test(bench): S7 mốc COMET A3 cho Q8_0 và Q4_K_M, ngưỡng tỉ lệ token"
```

### Task 6: Ghi quyết định S7 phần dịch

**Files:**
- Create: `bench/phase0/results/s7_mt_decisions.md`

- [ ] **Step 1: Tạo file, điền số từ `s7_mt.md` theo các quy tắc ghi trong mẫu**

```markdown
# S7 phần dịch: quyết định

Số liệu: `s7_mt.md`, chạy ngày <YYYY-MM-DD> trên <máy>, llama.cpp b11146.

## Mốc A3 (lượt chạy không có ngữ cảnh)

| Chiều | Q8_0 | Q4_K_M |
|---|---|---|
| en->vi | | |
| zh->vi | | |
| ja->vi | | |
| ko->vi | | |
| vi->en | | |
| vi->zh | | |
| vi->ja | | |
| vi->ko | | |

- Mức sàn Anh→Việt (Q8_0 ≥ 0,83; Q4_K_M ≥ 0,80): <đạt / không đạt>. Không đạt thì xem lại D5 trước khi làm MVP.
- Trung/Nhật/Hàn→Việt thấp hơn Anh→Việt quá 0,05: <các chiều không đạt, hoặc "không có">. Chiều nào không đạt thì xem lại D5 cho chiều đó.

## Giả định 6: Q4_K_M giảm COMET không quá 0,02 so với Q8_0

Quy tắc: đạt nếu chênh trung bình của "Hy-MT2-1.8B-Q4_K_M-plain − Q8_0" ở chiều Anh→Việt ≥ −0,02.
- Anh→Việt: <chênh> <95% CI>. <đạt / không đạt>
- Các chiều giảm quá 0,02: <danh sách, hoặc "không có">

## Cờ ngữ cảnh câu trước (§6.5)

Quy tắc: chỉ bật mặc định khi thỏa cả hai điều kiện:
- với cả Q8_0 và Q4_K_M, chênh COMET "context − plain" dương và cận dưới 95% CI > 0 ở cả bốn chiều Anh/Trung/Nhật/Hàn→Việt;
- chênh p50 thời gian ≤ +20% ở mọi chiều.

Nếu không thì giữ là cờ thử nghiệm, mặc định tắt.
- Kết quả: <bật / giữ tắt>
- Số câu dài gấp đôi (dịch luôn câu ngữ cảnh): <tổng theo chiều>

## Ngưỡng tỉ lệ token cho hậu xử lý (§6.5)

<chép bảng "Ngưỡng tỉ lệ token đề xuất" trong s7_mt.md>
```

- [ ] **Step 2: Commit**

```bash
git add bench/phase0/results/s7_mt_decisions.md
git commit -m "docs(bench): quyết định S7 phần dịch (mốc A3, Q4_K_M, cờ ngữ cảnh, ngưỡng token)"
```
