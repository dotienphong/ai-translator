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
import http.client

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
# Chỉ gọi 127.0.0.1: bỏ qua HTTP(S)_PROXY và proxy hệ thống, nếu không /health đi qua proxy và không bao giờ tới llama-server.
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
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
    """Lệnh chạy theo §6.5: -c 2048 -np 1 -ngl auto --no-ui, chỉ nghe 127.0.0.1, API key ngẫu nhiên.

    `--no-ui` là tên mới của `--no-webui` (b11146 vẫn nhận tên cũ nhưng đánh dấu deprecated).
    """

    def __init__(self, model, extra_args=(), log_path=None):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            self.port = s.getsockname()[1]
        self.key = secrets.token_hex(16)
        self.base = f"http://127.0.0.1:{self.port}"
        cmd = [find_llama_server(), "-m", model, "--host", "127.0.0.1", "--port", str(self.port),
               "--api-key", self.key, "-c", "2048", "-np", "1", "-ngl", "auto", "--no-ui", *extra_args]
        self.proc = None
        # "a": chạy lại (translate.py tiếp tục) không xóa log của lần server vừa chết.
        self._log = open(log_path or os.devnull, "a")
        try:
            self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=self._log)
            self._wait_ready(180)
        except BaseException:  # kể cả KeyboardInterrupt: `with` không chạy __exit__ khi __init__ lỗi
            self.close()
            raise

    def _wait_ready(self, timeout):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(f"llama-server thoát sớm (mã {self.proc.returncode}), xem log: {self._log.name}")
            try:
                with _OPENER.open(f"{self.base}/health", timeout=2) as r:
                    if r.status == 200:
                        return
            except urllib.error.HTTPError as e:  # 503 khi đang nạp model
                e.close()
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(0.2)
        raise RuntimeError(f"llama-server không sẵn sàng sau {timeout} giây, xem log: {self._log.name}")

    def _post(self, path, body):
        req = urllib.request.Request(f"{self.base}{path}", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json",
                                              "Authorization": f"Bearer {self.key}"})
        try:
            return _OPENER.open(req, timeout=300)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:500]
            e.close()
            raise RuntimeError(f"llama-server {path} trả HTTP {e.code}: {detail}") from None

    def chat(self, prompt, max_tokens=512, stream=False):
        """Tham số sinh theo §6.5. Trả (text, info); info có `finish_reason` ("stop" hoặc "length") ở cả hai chế độ."""
        body = {"messages": [{"role": "user", "content": prompt}], "temperature": 0.0, "repeat_penalty": 1.05,
                "max_tokens": max_tokens, "cache_prompt": True, "stream": stream}
        started = time.perf_counter()
        with self._post("/v1/chat/completions", body) as r:
            if not stream:
                data = json.load(r)
                t = data.get("timings", {})
                return data["choices"][0]["message"]["content"].strip(), {
                    "total_ms": (time.perf_counter() - started) * 1000,
                    "finish_reason": data["choices"][0]["finish_reason"],
                    "prompt_tokens": data["usage"]["prompt_tokens"],
                    "completion_tokens": data["usage"]["completion_tokens"],
                    "prompt_ms": t.get("prompt_ms"), "predicted_ms": t.get("predicted_ms")}
            text, first, finish, done = "", None, None, False
            for raw in r:
                line = raw.decode("utf-8").strip()
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    done = True
                    break
                obj = json.loads(payload)
                if "error" in obj:
                    raise RuntimeError(f"llama-server báo lỗi giữa stream: {obj['error']}")
                for choice in obj.get("choices") or []:
                    delta = choice.get("delta", {}).get("content") or ""
                    if delta and first is None:
                        first = (time.perf_counter() - started) * 1000
                    text += delta
                    finish = choice.get("finish_reason") or finish
            total = (time.perf_counter() - started) * 1000
            if not done:
                raise RuntimeError(f"stream kết thúc mà không có [DONE] (đã nhận {len(text)} ký tự): bản dịch có thể bị cụt")
            return text.strip(), {"total_ms": total, "first_token_ms": first if first is not None else total,
                                  "finish_reason": finish}

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
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
        if not self._log.closed:
            self._log.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
