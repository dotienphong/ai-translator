// Trang dựng cảnh bản 16:10 (spec 2026-10-21-demo-video-desktop §2.3): màn hình Windows 11 giả 1536×960 điểm CSS (render.mjs chụp ở
// mật độ 1,25 → 1920×1200). Ghép vỏ Windows (desktop-shell.mjs), cửa sổ họp (desktop-meeting.mjs) trên desktop 1, cửa sổ chat
// (desktop-chat.mjs) trên desktop 2. Thanh phụ đề và ô Gõ dịch là đúng overlay.html, compose.html của app (iframe, IPC giả
// `demo=1`, `platform=windows`) ở đúng chỗ app đặt trên Windows, font đổi sang "Demo UI". Sự kiện tới chúng theo lịch của
// desktop-timeline.mjs bằng setTimeout: render.mjs thay hẹn giờ bằng đồng hồ ảo (vclock.js); mở thẳng trong trình duyệt thì chạy
// theo giờ thật (bấm ▶ để phát, kèm giọng đọc).
//   http://127.0.0.1:1432/scripts/demo-video/desktop.html?script=desktop.vi
import { buildChat } from "./desktop-chat.mjs";
import { el, place, pop, show } from "./desktop-dom.mjs";
import { composeBox, overlayBox, pingPong } from "./desktop-layout.mjs";
import { buildMeeting } from "./desktop-meeting.mjs";
import { buildShell } from "./desktop-shell.mjs";
import { SLIDE_MS, buildDesktopTimeline, ease } from "./desktop-timeline.mjs";

const q = new URLSearchParams(location.search);
const name = q.get("script") ?? "desktop.vi";
const load = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`không tải được ${url} (${r.status})`);
  return r.json();
};
const here = (file) => new URL(file, import.meta.url).href;
const script = await load(here(`./script.${name}.json`));
const d = script.data;
const [voice, live, compose, frameIndex] = await Promise.all([
  load(here(`./data/voice.${d}.json`)),
  load(here(`./data/live.${d}.json`)),
  load(here(`./data/compose.${d}.json`)),
  load("/target/demo-video/frames/index.json"),
]);
const tl = buildDesktopTimeline(script, voice, live, compose);
const L = script.layout;
const ui = script.target;
// Phần cài đặt mà phía Rust gửi kèm `compose://open` (ComposeView của src/lib/ipc.ts): app chạy trên Windows.
const COMPOSE_VIEW = { uiLanguage: ui, theme: "light", target: script.chat.replyTarget, autoPaste: true, blocked: null, platform: "windows" };
// Trong hai iframe: font "Demo UI" như app trên Windows (Segoe UI), tắt transition/animation và con trỏ nhấp nháy (chạy theo giờ thật).
const IFRAME_CSS =
  '*,*::before,*::after{transition:none!important;animation:none!important;font-family:"Demo UI",sans-serif!important}textarea{caret-color:transparent!important}';

const assets = {
  frame: (clip, i) => {
    const count = frameIndex[clip];
    if (!count) throw new Error(`thiếu khung của clip ${clip}: chạy assets.mjs`);
    return `/target/demo-video/frames/${clip}/${String(pingPong(i, count) + 1).padStart(5, "0")}.jpg`;
  },
  still: (still) => `/target/demo-video/frames/${still}.jpg`,
  icon: "/src-tauri/icons/32x32.png",
  appIcon: "/src-tauri/icons/128x128@2x.png",
};
const ctx = { script, tl, voice, assets };

const screen = document.getElementById("screen");
const desks = el("div", "desks", screen);
const desk1 = el("div", "desk", desks);
const desk2 = el("div", "desk d2", desks);
const meeting = buildMeeting(desk1, ctx);
const overlayFrame = el("iframe", "frame overlay-frame", desk1);
place(overlayFrame, overlayBox(L));
overlayFrame.src = `/overlay.html?demo=1&session=running&empty=1&locked=1&platform=windows&lang=${ui}&size=${L.overlay.fontSize}`;
const chat = buildChat(desk2, ctx);
const composeFrame = el("iframe", "frame compose-frame", screen);
place(composeFrame, { ...composeBox(L, script.viewport), height: 320 });
composeFrame.src = `/compose.html?demo=1&platform=windows&lang=${ui}&theme=light`;
const shell = buildShell(screen, ctx);

/** Vẽ đúng hình của thời điểm `t` (ms từ đầu video); đợi ảnh clip của khung đã giải mã. */
async function render(t) {
  const [a, b] = tl.scenes.slide;
  const p = t <= a ? 0 : t >= b ? 1 : ease((t - a) / SLIDE_MS);
  desks.style.transform = `translateX(${-script.viewport.width * p}px)`;
  chat.render(t);
  show(composeFrame, pop(t, tl.chat.composeOpenAt, tl.chat.enter1At + 60, 120));
  shell.render(t);
  await meeting.render(t);
}

const loaded = (node) => new Promise((resolve) => node.addEventListener("load", resolve, { once: true }));
await Promise.all([loaded(overlayFrame), loaded(composeFrame)]);
for (const frame of [overlayFrame, composeFrame]) {
  if (typeof frame.contentWindow.__demoEmit !== "function") throw new Error(`${frame.src}: IPC giả chưa có demo=1`);
  const doc = frame.contentDocument;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = "/scripts/demo-video/fonts/demo-font.css";
  const linkLoaded = loaded(link);
  doc.head.append(link);
  await linkLoaded;
  const style = doc.createElement("style");
  style.textContent = IFRAME_CSS;
  doc.head.append(style);
  await doc.fonts.load('16px "Demo UI"', "Aạ");
}
await document.fonts.load('16px "Demo UI"', "Aạ");
await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));

const log = { translateAt: [] };
const overlayEmit = (event, payload) => overlayFrame.contentWindow.__demoEmit(event, payload);
const composeEmit = (event, payload) => composeFrame.contentWindow.__demoEmit(event, payload);

/** Hẹn mọi sự kiện của lịch; `t0` là giờ (performance.now) của khung đầu tiên. */
function start(t0) {
  const at = (ms, fn) => setTimeout(fn, ms - (performance.now() - t0));
  const w = composeFrame.contentWindow;
  const textarea = () => composeFrame.contentDocument.querySelector("textarea");
  // Như người gõ: đặt giá trị bằng setter gốc (React theo dõi giá trị) rồi bắn `input`, cùng cách của tauri-mock.ts.
  const type = (text) => {
    const node = textarea();
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, "value").set.call(node, text);
    node.dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  // Phía Rust của Gõ dịch: trả bản dịch thật (compose.json) về dần như stream từ model, rồi báo xong.
  window.__demo = {
    composeTranslate(id, emit) {
      log.translateAt.push(performance.now() - t0);
      for (const delta of tl.compose.deltas) {
        setTimeout(() => emit("compose://delta", { id, line: 0, text: delta.text, reset: false }), delta.after);
      }
      setTimeout(() => emit("compose://done", { id, outcome: { kind: "translated", text: tl.compose.text } }), tl.compose.totalMs);
    },
  };
  for (const e of tl.overlayEvents) at(e.at, () => overlayEmit(e.event, e.payload));
  const c = tl.chat;
  at(c.composeOpenAt, () => composeEmit("compose://open", COMPOSE_VIEW));
  for (const step of c.typing) at(step.at, () => type(step.text));
  at(c.enter1At, () => textarea().dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
}

window.__stage = { ready: false, render, log, timeline: tl };
if (typeof window.__vclock === "object") {
  start(0);
  await render(0);
  window.__stage.ready = true;
} else {
  await render(0);
  const play = el("button", "play", document.body, "▶ Phát");
  play.addEventListener("click", () => {
    play.remove();
    const audio = new Audio(`/target/demo-video/voice48.${d}.wav`);
    const t0 = performance.now();
    start(t0);
    setTimeout(() => void audio.play(), tl.voiceStartMs);
    const frame = async () => {
      const t = performance.now() - t0;
      await render(t);
      if (t < tl.totalMs) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
