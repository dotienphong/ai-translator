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

from notes_lib import EMPTY_NOTES, chunk_lines, lang_ok, parse_notes, render_lines  # noqa: E402

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


def run_job(lines: list[dict], lang: str, budget: int, count_tokens: Callable[[str], int],
            call: Callable[[list[dict], int], str], max_map: int, max_reduce: int) -> dict:
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
        prompt = _prompt("map.txt").replace("{language}", language).replace("{transcript}", render_lines(chunk))
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
    return result


# ---------------------------------------------------------------------------------------------------------------------
# Backend và dòng lệnh. Phần dưới đây cần mạng hay `llama-server`, kiểm bằng lượt chạy thật (Task 5), không có unit test.

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DEFAULT_SERVER = os.path.join(REPO, "tools", "llama-b11146", "win-vulkan-x64", "llama-server.exe")

# Cấu hình: -c, ngân sách chữ mỗi đoạn map, max_tokens của map và reduce (kế hoạch 01, Task 4 Step 1).
CONFIGS = {
    "c8k": {"ctx": 8192, "budget": 5000, "max_map": 800, "max_reduce": 1500},
    "c16k": {"ctx": 16384, "budget": 12000, "max_map": 1200, "max_reduce": 2000},
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


def local_call(server: LocalServer, json_mode: str, request_extra: dict, schema: dict, usage: list) -> Callable:
    def call(messages: list[dict], max_tokens: int) -> str:
        body = {"messages": messages, "temperature": 0, "max_tokens": max_tokens, **request_extra}
        if json_mode == "schema":
            body["response_format"] = {"type": "json_schema", "json_schema": {"name": "notes", "schema": schema}}
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

    def call(messages: list[dict], max_tokens: int) -> str:
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
                job = run_job(lines, lang, cfg["budget"], srv.count_tokens, call, cfg["max_map"], cfg["max_reduce"])
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
    loc.add_argument("--config", choices=["c8k", "c16k"], required=True)
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
    args = build_parser().parse_args(argv)
    return run_local(args) if args.mode == "local" else run_cloud(args)


if __name__ == "__main__":
    sys.exit(main())
