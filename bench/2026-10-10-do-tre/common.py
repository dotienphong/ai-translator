"""Phần dùng chung của các phép đo độ trễ 2026-10-10: chạy llama-server tạm, gọi dịch, so khớp tiền tố."""
import http.client
import json
import os
import secrets
import socket
import subprocess
import time
import unicodedata

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LLAMA = os.path.join(ROOT, "tools", "llama-b11146", "macos-arm64", "llama-b11146", "llama-server")
MODELS = os.path.join(ROOT, "models")
DATA = os.path.join(ROOT, "bench", "phase0", "data", "do-tre")  # không commit (.gitignore: /bench/phase0/data/)
ASR_MANIFEST = os.path.join(ROOT, "bench", "phase0", "data", "asr", "manifest.jsonl")

# Prompt của app (crates/pipeline/src/prompt.rs), không có thuật ngữ.
EN_TMPL = ("Translate the following text into {}. Note that you should only output the translated result "
           "without any additional explanation:\n\n{}")
ZH_TMPL = "将以下文本翻译为{}，注意只需要输出翻译后的结果，不要额外解释：\n\n{}"
NAMES_EN = {"vi": "Vietnamese", "en": "English"}
NAMES_ZH = {"vi": "越南语", "en": "英语"}
TARGET = {"en": "vi", "zh": "vi", "ja": "vi", "ko": "vi", "vi": "en"}


def prompt_for(src, tgt, text):
    if src == "zh" or tgt == "zh":
        return ZH_TMPL.format(NAMES_ZH[tgt], text)
    return EN_TMPL.format(NAMES_EN[tgt], text)


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def start_server(model, extra=(), log_path=None):
    """Chạy llama-server với cờ của app (`-c 2048 -np 1 -ngl auto --no-ui`), chờ /health. Trả (proc, port, key)."""
    port, key = _free_port(), secrets.token_hex(16)
    args = [LLAMA, "-m", model, "--host", "127.0.0.1", "--port", str(port), "-c", "2048", "-np", "1",
            "-ngl", "auto", "--no-ui", *extra]
    log = open(log_path or os.devnull, "w")
    proc = subprocess.Popen(args, env=dict(os.environ, LLAMA_API_KEY=key), stdout=log, stderr=log)
    started = time.time()
    while time.time() - started < 120:
        try:
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            c.request("GET", "/health")
            if c.getresponse().status == 200:
                return proc, port, key
        except OSError:
            pass
        time.sleep(0.2)
    proc.kill()
    raise SystemExit("llama-server không lên trong 120 s")


def post(port, key, body, stream):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=120)
    c.request("POST", "/v1/chat/completions", body=json.dumps(body),
              headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    return c, c.getresponse()


def chat(port, key, prompt, prefill=None, max_tokens=256, repeat_penalty=1.05):
    """Dịch như app (stream, temperature 0, cache_prompt). `prefill`: phần đầu câu trả lời ép sẵn.
    llama-server b11146 trả lại cả phần prefill trong stream, nên kết quả đã gồm phần đó.
    Trả (văn bản, ttft_s, tổng_s, timings)."""
    msgs = [{"role": "user", "content": prompt}]
    if prefill:
        msgs.append({"role": "assistant", "content": prefill})
    body = {"messages": msgs, "stream": True, "temperature": 0.0, "repeat_penalty": repeat_penalty,
            "max_tokens": max_tokens, "cache_prompt": True}
    t0 = time.perf_counter()
    c, r = post(port, key, body, True)
    out, ttft, timings = [], None, None
    for raw in r:
        line = raw.decode("utf-8").strip()
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if data == "[DONE]":
            break
        j = json.loads(data)
        timings = j.get("timings", timings)
        for ch in j.get("choices", []):
            d = ch.get("delta", {}).get("content")
            if d:
                ttft = ttft if ttft is not None else time.perf_counter() - t0
                out.append(d)
    total = time.perf_counter() - t0
    c.close()
    return "".join(out), ttft, total, timings


def units(text, lang):
    """Đơn vị so khớp: chữ cái cho zh/ja, từ (tách theo khoảng trắng) cho các tiếng còn lại."""
    t = unicodedata.normalize("NFC", text).strip()
    return [c for c in t if not c.isspace()] if lang in ("zh", "ja") else t.split()


def norm_units(text, lang):
    """Như `units` nhưng chữ thường và bỏ dấu câu, để chuyện thêm dấu chấm hay viết hoa không bị tính là đổi chữ."""
    t = "".join(ch for ch in unicodedata.normalize("NFC", text) if not unicodedata.category(ch).startswith("P"))
    return units(t.lower(), lang)


def lcp(a, b):
    n = 0
    while n < len(a) and n < len(b) and a[n] == b[n]:
        n += 1
    return n


def pct(values, q):
    v = sorted(values)
    return v[min(len(v) - 1, int(q * len(v)))]
