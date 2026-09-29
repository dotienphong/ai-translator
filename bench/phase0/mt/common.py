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
