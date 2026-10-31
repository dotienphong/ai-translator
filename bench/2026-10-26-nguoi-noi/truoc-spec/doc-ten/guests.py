"""Hai khách giả (Lan, Minh) cho cuộc họp thử, chạy trong Chrome tự động với hồ sơ tạm (không đụng hồ sơ của người dùng).

Micro của mỗi khách là file giọng đọc máy, đưa thẳng vào getUserMedia qua Web Audio; `/speak?g=lan&on=1` bật tiếng
(gain 1), `on=0` tắt (gain 0). Mỗi lần bật/tắt được ghi thời điểm (đồng hồ hệ thống) làm sự thật để so với dấu "đang nói".

Điều khiển qua HTTP 127.0.0.1:8765 (một luồng, tuần tự):
  /open?g=&url=   /shot?g=   /click?g=&text= | &sel= | &role=&name=   /fill?g=&sel=|&label=&text=   /press?g=&key=
  /speak?g=&on=   /eval?g=&js=   /text?g=   /log   /quit
"""

import base64
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

INIT = r"""
(() => {
  if (window.__fakeMicInstalled) return;
  window.__fakeMicInstalled = true;
  const B64 = %s;
  let ctx = null, gain = null, dest = null, ready = null;
  function setup() {
    if (ready) return ready;
    ready = (async () => {
      ctx = new AudioContext({ sampleRate: 48000 });
      gain = ctx.createGain();
      gain.gain.value = window.__speakOn ? 1 : 0;
      dest = ctx.createMediaStreamDestination();
      gain.connect(dest);
      const bin = Uint8Array.from(atob(B64), c => c.charCodeAt(0));
      const buf = await ctx.decodeAudioData(bin.buffer);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true; src.connect(gain); src.start();
      if (ctx.state !== 'running') await ctx.resume();
    })();
    return ready;
  }
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return;
  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = async (c) => {
    const s = await orig(c);
    if (c && c.audio) {
      await setup();
      s.getAudioTracks().forEach(t => { s.removeTrack(t); t.stop(); });
      s.addTrack(dest.stream.getAudioTracks()[0].clone());
    }
    return s;
  };
  window.__speak = async (on) => {
    window.__speakOn = !!on;
    await setup();
    gain.gain.setValueAtTime(on ? 1 : 0, ctx.currentTime);
    return ctx.state;
  };
})();
"""

# Âm thanh của từng khách trong `audio/`; đổi bằng biến môi trường (ví dụ thử phụ đề tiếng Việt với `vi.wav`).
GUESTS = {"lan": os.environ.get("GUEST_LAN_WAV", "lan.wav"), "minh": os.environ.get("GUEST_MINH_WAV", "minh.wav")}
log = []


def main():
    with sync_playwright() as p:
        pages = {}
        browsers = []
        for g, wav in GUESTS.items():
            browser = p.chromium.launch(
                channel="chrome",
                headless=False,
                args=[
                    "--use-fake-ui-for-media-stream",
                    "--use-fake-device-for-media-stream",
                    "--use-file-for-fake-audio-capture=" + os.path.join(HERE, "audio", wav),
                    "--autoplay-policy=no-user-gesture-required",
                    "--disable-blink-features=AutomationControlled",
                ],
                ignore_default_args=["--enable-automation"],
            )
            browsers.append(browser)
            ctx = browser.new_context(viewport={"width": 1100, "height": 760}, permissions=["microphone", "camera"])
            pages[g] = ctx.new_page()

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def reply(self, obj, code=200):
                data = json.dumps(obj, ensure_ascii=False).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                u = urlparse(self.path)
                q = {k: v[0] for k, v in parse_qs(u.query).items()}
                pg = pages.get(q.get("g", ""))
                try:
                    if u.path == "/open":
                        pg.goto(q["url"], wait_until="domcontentloaded", timeout=60000)
                        return self.reply({"ok": True, "url": pg.url})
                    if u.path == "/shot":
                        f = os.path.join(OUT, f"{q['g']}-{int(time.time())}.png")
                        pg.screenshot(path=f)
                        return self.reply({"file": f})
                    if u.path == "/click":
                        if "sel" in q:
                            pg.locator(q["sel"]).first.click(timeout=10000)
                        elif "role" in q:
                            pg.get_by_role(q["role"], name=q["name"]).first.click(timeout=10000)
                        else:
                            pg.get_by_text(q["text"], exact=q.get("exact") == "1").first.click(timeout=10000)
                        return self.reply({"ok": True})
                    if u.path == "/fill":
                        loc = pg.locator(q["sel"]).first if "sel" in q else pg.get_by_label(q["label"]).first
                        loc.fill(q["text"], timeout=10000)
                        return self.reply({"ok": True})
                    if u.path == "/press":
                        pg.keyboard.press(q["key"])
                        return self.reply({"ok": True})
                    if u.path == "/speak":
                        # Bật/tắt mic bằng phím tắt của app họp (key=...), ghi thời điểm làm sự thật.
                        on = q.get("on") == "1"
                        t = time.time()
                        sel = q.get("onsel" if on else "offsel")
                        if sel:
                            pg.locator(sel).first.click(timeout=5000)
                        else:
                            pg.keyboard.press(q["key"])
                        log.append({"t": t, "g": q["g"], "on": on})
                        return self.reply({"ok": True, "t": t})
                    if u.path == "/eval":
                        return self.reply({"result": pg.evaluate(q["js"])})
                    if u.path == "/text":
                        return self.reply({"text": pg.inner_text("body")[:4000]})
                    if u.path == "/log":
                        return self.reply(log)
                    if u.path == "/quit":
                        self.reply({"ok": True})
                        raise SystemExit
                    return self.reply({"error": "không biết"}, 404)
                except SystemExit:
                    raise
                except Exception as e:  # trả lỗi để điều khiển tiếp
                    return self.reply({"error": str(e)[:800]}, 500)

        srv = HTTPServer(("127.0.0.1", 8765), H)
        print("sẵn sàng", flush=True)
        try:
            srv.serve_forever()
        except SystemExit:
            pass
        json.dump(log, open(os.path.join(OUT, f"truth-{int(time.time())}.json"), "w"))
        for b in browsers:
            b.close()


if __name__ == "__main__":
    sys.exit(main())
