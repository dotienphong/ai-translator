"""Chạy map-reduce ghi chú cuộc họp qua `llama-server` hay API cloud và đo thời gian, RAM (spike, không vào app).

`run_job` là phần thuần (không mạng); backend local và cloud ở phía dưới."""
import argparse
import copy
import fnmatch
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from typing import Callable

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from notes_lib import (EMPTY_NOTES, _first_object, chunk_lines, due_supported, lang_ok, has_cjk, owner_known, parse_notes, parse_verdicts,  # noqa: E402
                       render_lines, render_verify_lines)

HERE = os.path.dirname(os.path.abspath(__file__))
LANGUAGE_NAME = {"vi": "Vietnamese", "en": "English"}


def _prompt(name: str) -> str:
    with open(os.path.join(HERE, "prompts", name), encoding="utf-8") as f:
        return f.read().rstrip("\n")


def _empty_notes() -> dict:
    notes = copy.deepcopy(EMPTY_NOTES)
    notes["_stats"] = {"refs_total": 0, "refs_invalid": 0, "owners_cleared": 0}
    return notes


def _without_stats(notes: dict) -> dict:
    return {k: v for k, v in notes.items() if k != "_stats"}


def _merge_mechanically(parts: list[dict]) -> dict:
    merged = {"summary": "\n".join(p["summary"] for p in parts), "decisions": [], "action_items": [],
              "open_questions": [], "_stats": {"refs_total": 0, "refs_invalid": 0, "owners_cleared": 0}}
    for p in parts:
        for key in ("decisions", "action_items", "open_questions"):
            merged[key].extend(p[key])
        for key, value in p["_stats"].items():
            merged["_stats"][key] += value
    return merged


VERIFY_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["items"],
    "properties": {"items": {"type": "array", "items": {
        "type": "object", "additionalProperties": False, "required": ["n", "keep", "owner", "due"],
        "properties": {"n": {"type": "integer"}, "keep": {"type": "boolean"}, "owner": {"type": "string"},
                       "due": {"type": "string"}}}}}}
VERIFY_TOKENS_PER_ITEM = 40


def _batches(items: list[dict], lines: list[dict], budget: int, count_tokens: Callable[[str], int],
             around: int) -> list[list[dict]]:
    """Gom việc thành lô sao cho các câu cần cho một lô không quá `budget` token; việc quá lớn đi một mình."""
    out: list[list[dict]] = []
    cur: list[dict] = []
    for item in items:
        if cur:
            refs = [r for i in cur + [item] for r in i["refs"]]
            if count_tokens(render_verify_lines(lines, refs, around)) > budget:
                out.append(cur)
                cur = []
        cur.append(item)
    if cur:
        out.append(cur)
    return out


def verify_actions(notes: dict, lines: list[dict], lang: str, call: Callable, count_tokens: Callable[[str], int],
                   budget: int, around: int, result: dict) -> None:
    """Kiểm việc cần làm theo lô với câu gốc quanh `refs`: bỏ việc không có lời giao/nhận, sửa người nhận và hạn.

    Nội dung việc giữ nguyên (model hay chép lại câu gốc sai ngôn ngữ). Việc không có `refs` bị bỏ luôn. Việc không có
    phán quyết đọc được (sau một lần thử lại cả lô) được giữ nguyên. Hạn có chữ CJK bị bỏ qua: ghi chú là vi hay en."""
    stats = {"checked": 0, "dropped": 0, "edited": 0, "unparsed": 0, "no_refs": 0}
    template = _prompt("verify.txt").replace("{language}", LANGUAGE_NAME[lang])
    fix = _prompt("fix.txt")
    with_refs = []
    for item in notes["action_items"]:
        if item["refs"]:
            with_refs.append(item)
        else:
            stats["no_refs"] += 1
    kept_ids: set[int] = set()
    replaced: dict[int, dict] = {}
    for batch in _batches(with_refs, lines, budget, count_tokens, around):
        stats["checked"] += len(batch)
        shown = "\n".join(json.dumps({"n": n, **{k: it[k] for k in ("text", "owner", "due", "refs")}},
                                      ensure_ascii=False) for n, it in enumerate(batch, 1))
        refs = [r for it in batch for r in it["refs"]]
        prompt = template.replace("{lines}", render_verify_lines(lines, refs, around)).replace("{items}", shown)
        messages = [{"role": "user", "content": prompt}]
        max_tokens = 100 + VERIFY_TOKENS_PER_ITEM * len(batch)
        raw = call(messages, max_tokens, schema=VERIFY_SCHEMA)
        verdicts = parse_verdicts(raw)
        valid_first = verdicts is not None
        if verdicts is None:
            retry = messages + [{"role": "assistant", "content": raw}, {"role": "user", "content": fix}]
            verdicts = parse_verdicts(call(retry, max_tokens, schema=VERIFY_SCHEMA))
        result["calls"].append({"kind": "verify", "valid_first": valid_first, "valid": verdicts is not None})
        for n, item in enumerate(batch, 1):
            v = (verdicts or {}).get(n)
            if v is None:
                stats["unparsed"] += 1
                kept_ids.add(id(item))
                continue
            if not v["keep"]:
                stats["dropped"] += 1
                continue
            owner = v["owner"] if owner_known(v["owner"], lines) else ""
            due = item["due"] if has_cjk(v["due"]) else v["due"]
            if (owner, due) != (item["owner"], item["due"]):
                stats["edited"] += 1
                replaced[id(item)] = {**item, "owner": owner, "due": due}
            kept_ids.add(id(item))
    notes["action_items"] = [replaced.get(id(i), i) for i in with_refs if id(i) in kept_ids]
    result["verify"] = stats


def _norm(text: str) -> str:
    return " ".join(text.lower().split())


def _merge_items(parts: list[dict]) -> dict:
    """Gộp máy các mục của mọi đoạn; mục trùng chữ (bỏ hoa/thường, khoảng trắng) gộp `refs`, giữ người nhận/hạn đầu tiên
    không rỗng."""
    merged = _merge_mechanically(parts)
    for key in ("decisions", "action_items", "open_questions"):
        seen: dict[str, dict] = {}
        out = []
        for item in merged[key]:
            k = _norm(item["text"])
            if k in seen:
                first = seen[k]
                first["refs"] = sorted(set(first["refs"]) | set(item["refs"]))
                for field in ("owner", "due"):
                    if field in item and not first.get(field):
                        first[field] = item[field]
                continue
            item = dict(item)
            seen[k] = item
            out.append(item)
        merged[key] = out
    return merged


def _reduce_summary(parts: list[dict], language: str, call: Callable, result: dict) -> dict:
    """Gộp nhẹ: mục gộp bằng máy, model chỉ viết tóm tắt cả buổi từ tóm tắt từng đoạn (ít token đầu ra hơn nhiều)."""
    notes = _merge_items(parts)
    prompt = _prompt("reduce_summary.txt").replace("{language}", language).replace(
        "{parts}", "\n".join(json.dumps(p["summary"], ensure_ascii=False) for p in parts))
    messages = [{"role": "user", "content": prompt}]
    schema = {"type": "object", "additionalProperties": False, "required": ["summary"],
              "properties": {"summary": {"type": "string"}}}

    def parse(raw: str) -> str | None:
        obj = _first_object(raw)
        try:
            data = json.loads(obj) if obj else None
        except ValueError:
            return None
        return data["summary"].strip() if isinstance(data, dict) and isinstance(data.get("summary"), str) else None

    raw = call(messages, MAX_SUMMARY, schema=schema)
    summary = parse(raw)
    valid_first = summary is not None
    if summary is None:
        retry = messages + [{"role": "assistant", "content": raw}, {"role": "user", "content": _prompt("fix.txt")}]
        summary = parse(call(retry, MAX_SUMMARY, schema=schema))
    result["calls"].append({"kind": "reduce", "valid_first": valid_first, "valid": summary is not None})
    if summary is None:
        result["reduce_fallback"] = True
    else:
        notes["summary"] = summary
    return notes


MAX_SUMMARY = 800


def _finish(result: dict, lines: list[dict], lang: str, call: Callable, count_tokens: Callable[[str], int],
            verify: bool, verify_budget: int, verify_around: int, due_check: bool) -> None:
    if verify:
        verify_actions(result["notes"], lines, lang, call, count_tokens, verify_budget, verify_around, result)
    if due_check:
        cleared = 0
        for item in result["notes"]["action_items"]:
            if item["due"] and not due_supported(item["due"], lines, item["refs"]):
                item["due"] = ""
                cleared += 1
        result["due_cleared"] = cleared


def run_job(lines: list[dict], lang: str, budget: int, count_tokens: Callable[[str], int],
            call: Callable[[list[dict], int], str], max_map: int, max_reduce: int, verify: bool = False,
            map_prompt: str = "map.txt", verify_budget: int = 6000, verify_around: int = 2,
            reduce_mode: str = "full", map_source: bool = False, due_check: bool = False) -> dict:
    result = {"notes": None, "raw_fallback": None, "chunks": 0, "failed_chunks": 0, "reduce_fallback": False,
              "calls": []}
    language = LANGUAGE_NAME[lang]
    fix = _prompt("fix.txt")

    def ask(kind: str, prompt: str, max_tokens: int):
        """Một lượt gọi có thử lại một lần. Trả (ghi chú | None, chuỗi cuối cùng nhận được)."""
        messages = [{"role": "user", "content": prompt}]
        raw = call(messages, max_tokens)
        notes = parse_notes(raw, lines)
        valid_first = notes is not None
        if notes is None:
            retry = messages + [{"role": "assistant", "content": raw}, {"role": "user", "content": fix}]
            raw = call(retry, max_tokens)
            notes = parse_notes(raw, lines)
        result["calls"].append({"kind": kind, "valid_first": valid_first, "valid": notes is not None})
        return notes, raw

    chunks = chunk_lines(lines, budget, count_tokens)
    result["chunks"] = len(chunks)
    if not chunks:
        result["notes"] = _empty_notes()
        return result

    parts: list[dict] = []
    last_raw = ""
    for chunk in chunks:
        prompt = _prompt(map_prompt).replace("{language}", language).replace("{transcript}", render_lines(chunk, source=map_source))
        notes, last_raw = ask("map", prompt, max_map)
        if notes is None:
            result["failed_chunks"] += 1
        else:
            parts.append(notes)

    if not parts:
        result["raw_fallback"] = last_raw
        return result
    if len(chunks) == 1 and len(parts) == 1:
        result["notes"] = parts[0]
        _finish(result, lines, lang, call, count_tokens, verify, verify_budget, verify_around, due_check)
        return result

    if reduce_mode == "summary":
        result["notes"] = _reduce_summary(parts, language, call, result)
        _finish(result, lines, lang, call, count_tokens, verify, verify_budget, verify_around, due_check)
        return result

    while len(parts) > 1:
        next_level: list[dict] = []
        i = 0
        while i < len(parts):
            group = parts[i:i + 2]
            if len(group) < 2:
                next_level.append(group[0])  # một bản lẻ đi thẳng lên tầng sau
                break
            while i + len(group) < len(parts):
                candidate = parts[i:i + len(group) + 1]
                joined = "\n".join(json.dumps(_without_stats(p), ensure_ascii=False, separators=(",", ":"))
                                   for p in candidate)
                if count_tokens(joined) > budget:
                    break
                group = candidate
            i += len(group)
            body = "\n".join(json.dumps(_without_stats(p), ensure_ascii=False, separators=(",", ":"))
                             for p in group)
            prompt = _prompt("reduce.txt").replace("{language}", language).replace("{parts}", body)
            notes, _ = ask("reduce", prompt, max_reduce)
            if notes is None:
                result["reduce_fallback"] = True
                notes = _merge_mechanically(group)
            next_level.append(notes)
        parts = next_level
    result["notes"] = parts[0]
    _finish(result, lines, lang, call, count_tokens, verify, verify_budget, verify_around, due_check)
    return result


# ---------------------------------------------------------------------------------------------------------------------
# Backend và dòng lệnh. Phần dưới đây cần mạng hay `llama-server`, kiểm bằng lượt chạy thật (Task 5), không có unit test.

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DEFAULT_SERVER = os.path.join(REPO, "tools", "llama-b11146", "win-vulkan-x64", "llama-server.exe")

# Cấu hình: -c, ngân sách chữ mỗi đoạn map, max_tokens của map và reduce (kế hoạch 01, Task 4 Step 1).
CONFIGS = {
    "c8k": {"ctx": 8192, "budget": 5000, "max_map": 800, "max_reduce": 1500},
    "c16k": {"ctx": 16384, "budget": 12000, "max_map": 1200, "max_reduce": 2000},
    # Thêm sau lượt c8k đầu tiên: mọi lần JSON hỏng ở c8k đều do bị cắt ở max_tokens (results/tu-dong.md).
    "c8kb": {"ctx": 8192, "budget": 3500, "max_map": 1600, "max_reduce": 2500},
    # Sau lượt c16k: ghi chú tiếng Hàn dùng nhiều token đầu ra, map chạm trần 1200 và reduce chạm trần 2000.
    "c16kb": {"ctx": 16384, "budget": 12000, "max_map": 2000, "max_reduce": 3000},
    # Sau chấm tay c16kb (56/180 việc cần làm sai): lời nhắc map chặt hơn và lượt kiểm việc cần làm với câu gốc.
    # (Lượt `c16kv` ngày 2026-11-12 kiểm từng việc một và cho model viết lại nội dung: phiên 60 phút vượt 900 s,
    # RSS phình do bộ đệm prompt, nội dung bị chép lại bằng tiếng Nhật. Bản đó ở lịch sử git, cấu hình đã bỏ.)
    "c16kw": {"ctx": 16384, "budget": 12000, "max_map": 2000, "max_reduce": 3000, "verify": True,
              "map_prompt": "map_v2.txt", "verify_budget": 6000},
    # Sau c16kw: kiểm theo lô bỏ ít hơn hẳn kiểm từng việc (ko-60: 1/31 so với 8/31) mà vẫn 953 s; token đầu ra là phần
    # đắt (≈ 9 token/s trên iGPU), lượt reduce viết lại mọi mục (≈ 2000 token). Nay: reduce chỉ viết tóm tắt, mục gộp
    # bằng máy; kiểm từng việc (ngân sách lô 1 token) với ±1 câu.
    "c16kx": {"ctx": 16384, "budget": 12000, "max_map": 2000, "max_reduce": 3000, "verify": True,
              "map_prompt": "map_v2.txt", "verify_budget": 1, "verify_around": 1, "reduce_mode": "summary"},
    # Sau chấm tay c16kx (42/177 việc sai, phần lớn do dịch máy): map đọc lời gốc thay vì bản dịch, và hạn có con số
    # không thấy trong lời gốc quanh `refs` thì bị xoá.
    "c16ky": {"ctx": 16384, "budget": 12000, "max_map": 2000, "max_reduce": 3000, "verify": True,
              "map_prompt": "map_v3.txt", "verify_budget": 1, "verify_around": 1, "reduce_mode": "summary",
              "map_source": True, "due_check": True},
    "cloud": {"ctx": None, "budget": 60000, "max_map": 4000, "max_reduce": 4000},
}


def norm_path(path: str) -> str:
    """Git Bash đưa `/d/Dev/...`; Python native của Windows cần `D:/Dev/...`."""
    if os.name == "nt":
        m = re.match(r"^/([a-zA-Z])/(.*)$", path)
        if m:
            return f"{m.group(1).upper()}:/{m.group(2)}"
    return path


def data_dir(arg: str | None) -> str:
    path = arg or os.environ.get("DATA")
    if not path:
        sys.exit("Thiếu thư mục dữ liệu: đặt biến môi trường DATA hay truyền --data.")
    return norm_path(path)


def notes_lang_of(name: str) -> str:
    """Ngôn ngữ ghi chú lấy từ tên file: `vi-*` → en, còn lại → vi."""
    return "en" if name.startswith("vi-") else "vi"


def load_set(data: str, pattern: str | None) -> list[tuple[str, list[dict]]]:
    folder = os.path.join(data, "set")
    out = []
    for fname in sorted(os.listdir(folder)):
        if not fname.endswith(".jsonl"):
            continue
        name = fname[:-len(".jsonl")]
        if pattern and not fnmatch.fnmatch(name, pattern):
            continue
        with open(os.path.join(folder, fname), encoding="utf-8") as f:
            out.append((name, [json.loads(line) for line in f if line.strip()]))
    return out


def http_json(url: str, body: dict | None, headers: dict, timeout: float) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", **headers},
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class LocalServer:
    """Một tiến trình `llama-server` cho một bản chép lời: khởi động, chạy, tắt."""

    def __init__(self, exe: str, model: str, ctx: int, hw: str, server_args: list[str]):
        self.port = free_port()
        cmd = [exe, "-m", model, "--host", "127.0.0.1", "--port", str(self.port), "-c", str(ctx), "-np", "1",
               "--no-slots", "--no-ui"]
        cmd += ["-ngl", "auto"] if hw == "gpu" else ["-ngl", "0", "--device", "none"]
        # Bộ nhớ đệm prompt trên RAM (mặc định 8192 MiB ở b11146) làm RSS phình tới 12 GiB khi có nhiều lượt gọi.
        cmd += ["--cache-ram", "0"]
        cmd += server_args
        self.cmd = cmd
        self.proc: subprocess.Popen | None = None
        self.peak_rss_mib = 0.0
        self.load_ms = 0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.exe = exe

    def __enter__(self):
        started = time.monotonic()
        self.proc = subprocess.Popen(self.cmd, cwd=os.path.dirname(self.exe) or None, stdin=subprocess.DEVNULL,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._thread = threading.Thread(target=self._watch_rss, daemon=True)
        self._thread.start()
        deadline = started + 300
        while True:
            if self.proc.poll() is not None:
                raise RuntimeError(f"llama-server thoát sớm (mã {self.proc.returncode}); chạy tay lệnh để xem lỗi")
            try:
                if http_json(f"http://127.0.0.1:{self.port}/health", None, {}, 2).get("status") == "ok":
                    break
            except (urllib.error.URLError, OSError, ValueError):
                pass
            if time.monotonic() > deadline:
                raise RuntimeError("llama-server không sẵn sàng sau 300 s")
            time.sleep(0.5)
        self.load_ms = int((time.monotonic() - started) * 1000)
        return self

    def _watch_rss(self):
        import psutil  # chỉ cần khi đo local
        try:
            ps = psutil.Process(self.proc.pid)
        except psutil.Error:
            return
        while not self._stop.is_set():
            try:
                self.peak_rss_mib = max(self.peak_rss_mib, ps.memory_info().rss / 1048576)
            except psutil.Error:
                return
            self._stop.wait(1.0)

    def __exit__(self, *exc):
        self._stop.set()
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        return False

    def count_tokens(self, text: str) -> int:
        return len(http_json(f"http://127.0.0.1:{self.port}/tokenize", {"content": text}, {}, 120)["tokens"])


def local_call(server: LocalServer, json_mode: str, request_extra: dict, notes_schema: dict, usage: list) -> Callable:
    def call(messages: list[dict], max_tokens: int, schema: dict | None = None) -> str:
        body = {"messages": messages, "temperature": 0, "max_tokens": max_tokens, **request_extra}
        if json_mode == "schema":
            body["response_format"] = {"type": "json_schema",
                                       "json_schema": {"name": "notes", "schema": schema or notes_schema}}
        started = time.monotonic()
        resp = http_json(f"http://127.0.0.1:{server.port}/v1/chat/completions", body, {}, 1800)
        u = resp.get("usage", {})
        usage.append({"prompt_tokens": u.get("prompt_tokens"), "completion_tokens": u.get("completion_tokens"),
                      "ms": int((time.monotonic() - started) * 1000)})
        return resp["choices"][0]["message"].get("content") or ""
    return call


def cloud_call(provider: str, model: str, usage: list) -> Callable:
    env = "OPENAI_API_KEY" if provider == "openai" else "GEMINI_API_KEY"
    key = os.environ.get(env)
    if not key:
        sys.exit(f"Thiếu biến môi trường {env}; không gọi mạng.")

    def post(url: str, headers: dict, body: dict) -> dict:
        for attempt in range(4):
            try:
                return http_json(url, body, headers, 120)
            except urllib.error.HTTPError as e:
                if e.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise RuntimeError(f"cloud HTTP {e.code}") from None  # không đọc thân lỗi: có thể lặp lại key
                time.sleep(5 * (attempt + 1))
            except (urllib.error.URLError, OSError):
                if attempt == 3:
                    raise RuntimeError("không kết nối được tới máy chủ cloud") from None
                time.sleep(5 * (attempt + 1))
        raise RuntimeError("unreachable")

    def call(messages: list[dict], max_tokens: int, schema: dict | None = None) -> str:
        started = time.monotonic()
        if provider == "openai":
            body = {"model": model, "messages": messages, "temperature": 0, "max_tokens": max_tokens,
                    "response_format": {"type": "json_object"}}
            resp = post("https://api.openai.com/v1/chat/completions", {"Authorization": f"Bearer {key}"}, body)
            u = resp.get("usage", {})
            usage.append({"prompt_tokens": u.get("prompt_tokens"), "completion_tokens": u.get("completion_tokens"),
                          "ms": int((time.monotonic() - started) * 1000)})
            return resp["choices"][0]["message"].get("content") or ""
        gen = {"temperature": 0, "maxOutputTokens": max_tokens, "responseMimeType": "application/json"}
        if "3.1" in model or "3.5" in model:
            gen["thinkingConfig"] = {"thinkingLevel": "MINIMAL"}  # như cloud_mt.rs: không để model tốn token suy nghĩ
        body = {"contents": [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                             for m in messages], "generationConfig": gen}
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        resp = post(url, {"x-goog-api-key": key}, body)
        u = resp.get("usageMetadata", {})
        usage.append({"prompt_tokens": u.get("promptTokenCount"), "completion_tokens": u.get("candidatesTokenCount"),
                      "ms": int((time.monotonic() - started) * 1000)})
        parts = (resp.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        return "".join(p.get("text", "") for p in parts)
    return call


def write_result(out_dir: str, name: str, payload: dict) -> None:
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)


def finish(system: str, name: str, lang: str, load_ms: int, gen_ms: int, rss, job: dict, usage: list) -> dict:
    notes = job["notes"]
    return {"system": system, "name": name, "lang": lang, "load_ms": load_ms, "gen_ms": gen_ms,
            "peak_rss_mib": rss, "job": job, "lang_ok": bool(notes) and lang_ok(notes, lang), "usage": usage}


def run_local(args) -> int:
    data = data_dir(args.data)
    with open(os.path.join(HERE, "candidates.json"), encoding="utf-8") as f:
        cands = {c["id"]: c for c in json.load(f)}
    if args.candidate not in cands:
        sys.exit(f"Không có ứng viên {args.candidate} trong candidates.json")
    cand, cfg = cands[args.candidate], CONFIGS[args.config]
    with open(os.path.join(HERE, "schema.json"), encoding="utf-8") as f:
        schema = json.load(f)
    system = f"{cand['id']}-{args.config}-{args.hw}"
    out_dir = os.path.join(data, "out", system)
    exe = norm_path(args.server or DEFAULT_SERVER)
    failed = 0
    for name, lines in load_set(data, args.filter):
        target = os.path.join(out_dir, f"{name}.json")
        if os.path.exists(target) and not args.force:
            print(f"bỏ qua {system}/{name} (đã có)")
            continue
        lang, usage = notes_lang_of(name), []
        try:
            with LocalServer(exe, os.path.join(data, "models", cand["file"]), cfg["ctx"], args.hw,
                             cand["server_args"]) as srv:
                call = local_call(srv, args.json_mode, cand.get("request_extra", {}), schema, usage)
                started = time.monotonic()
                job = run_job(lines, lang, cfg["budget"], srv.count_tokens, call, cfg["max_map"], cfg["max_reduce"],
                              verify=cfg.get("verify", False), map_prompt=cfg.get("map_prompt", "map.txt"),
                              verify_budget=cfg.get("verify_budget", 6000),
                              verify_around=cfg.get("verify_around", 2),
                              reduce_mode=cfg.get("reduce_mode", "full"),
                              map_source=cfg.get("map_source", False), due_check=cfg.get("due_check", False))
                gen_ms = int((time.monotonic() - started) * 1000)
            write_result(out_dir, name, finish(system, name, lang, srv.load_ms, gen_ms,
                                               round(srv.peak_rss_mib, 1), job, usage))
            print(f"{system}/{name}: tải {srv.load_ms} ms, chạy {gen_ms} ms, RSS đỉnh {srv.peak_rss_mib:.0f} MiB")
        except Exception as e:  # một bản chép lời lỗi không làm hỏng cả lượt
            failed += 1
            print(f"LỖI {system}/{name}: {type(e).__name__}: {e}", file=sys.stderr)
    return 1 if failed else 0


def run_cloud(args) -> int:
    data = data_dir(args.data)
    cfg = CONFIGS["cloud"]
    system = f"{args.provider}-{args.model}"
    out_dir = os.path.join(data, "out", system)
    failed = 0
    for name, lines in load_set(data, args.filter):
        target = os.path.join(out_dir, f"{name}.json")
        if os.path.exists(target) and not args.force:
            print(f"bỏ qua {system}/{name} (đã có)")
            continue
        lang, usage = notes_lang_of(name), []
        try:
            call = cloud_call(args.provider, args.model, usage)
            started = time.monotonic()
            job = run_job(lines, lang, cfg["budget"], lambda t: len(t) // 2, call, cfg["max_map"], cfg["max_reduce"])
            gen_ms = int((time.monotonic() - started) * 1000)
            write_result(out_dir, name, finish(system, name, lang, 0, gen_ms, None, job, usage))
            print(f"{system}/{name}: chạy {gen_ms} ms")
        except Exception as e:
            failed += 1
            print(f"LỖI {system}/{name}: {type(e).__name__}: {e}", file=sys.stderr)
    return 1 if failed else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Chạy ghi chú cuộc họp trên bộ thử và đo.")
    sub = parser.add_subparsers(dest="mode", required=True)
    loc = sub.add_parser("local", help="llama-server trên máy")
    loc.add_argument("--candidate", required=True)
    loc.add_argument("--config", choices=["c8k", "c8kb", "c16k", "c16kb", "c16kw", "c16kx", "c16ky"], required=True)
    loc.add_argument("--hw", choices=["gpu", "cpu"], required=True)
    loc.add_argument("--json-mode", choices=["schema", "prompt"], default="schema")
    loc.add_argument("--server")
    cloud = sub.add_parser("cloud", help="API cloud")
    cloud.add_argument("--provider", choices=["openai", "gemini"], required=True)
    cloud.add_argument("--model", required=True)
    for p in (loc, cloud):
        p.add_argument("--filter", help="glob theo tên bản chép lời, ví dụ '*-chuan-60'")
        p.add_argument("--force", action="store_true", help="chạy lại cả file đã có")
        p.add_argument("--data", help="thư mục dữ liệu (mặc định biến môi trường DATA)")
    return parser


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):  # console Windows mặc định cp1252; `python -I` bỏ qua PYTHONIOENCODING
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    args = build_parser().parse_args(argv)
    return run_local(args) if args.mode == "local" else run_cloud(args)


if __name__ == "__main__":
    sys.exit(main())
