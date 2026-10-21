// Trang dựng cảnh của video (spec 2026-10-21-demo-video §2.4): khung 540×960 điểm CSS (render.mjs chụp ở mật độ 2 → 1080×1920).
// Cửa sổ cuộc gọi, khung chat, chú thích, phím và màn kết do trang này vẽ theo thời điểm `t` (`render(t)` không giữ trạng thái:
// cùng `t` là cùng hình). Thanh phụ đề và ô Gõ dịch là đúng overlay.html, compose.html của app (iframe, IPC giả `demo=1`); sự
// kiện tới chúng theo lịch của timeline.mjs bằng setTimeout. render.mjs thay hẹn giờ bằng đồng hồ ảo (vclock.js); mở thẳng trong
// trình duyệt thì chạy theo giờ thật (bấm ▶ để phát, kèm giọng đọc), để xem nhanh.
//   http://127.0.0.1:1432/scripts/demo-video/stage.html?script=vi        thêm &guides=1 để tô đỏ phần ngoài vùng an toàn
import { buildTimeline, levelAt, visibility } from "./timeline.mjs";

const q = new URLSearchParams(location.search);
const lang = q.get("script") ?? "vi";
const load = async (name) => {
  const r = await fetch(new URL(name, import.meta.url));
  if (!r.ok) throw new Error(`không tải được ${name} (${r.status})`);
  return r.json();
};
const [script, voice, live, compose] = await Promise.all([
  load(`./script.${lang}.json`),
  load(`./data/voice.${lang}.json`),
  load(`./data/live.${lang}.json`),
  load(`./data/compose.${lang}.json`),
]);
const tl = buildTimeline(script, voice, live, compose);
const L = script.layout;
// Ngôn ngữ giao diện của app trong video: ngôn ngữ đích của phụ đề, cũng là tiếng của người xem (`lang` chỉ là tên file kịch bản).
const ui = script.target;
// Phần cài đặt mà phía Rust gửi kèm `compose://open` (ComposeView của src/lib/ipc.ts).
const COMPOSE_VIEW = { uiLanguage: ui, theme: "light", target: script.chat.replyTarget, autoPaste: true, blocked: null, platform: "macos" };
// Trong hai iframe: tắt transition/animation và con trỏ nhấp nháy (chạy theo giờ thật, làm các lần dựng khác nhau).
const FREEZE_CSS =
  "*,*::before,*::after{transition:none!important;animation:none!important}textarea{caret-color:transparent!important}";

const el = (tag, cls, parent, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
};
const place = (node, box) => {
  for (const k of ["left", "top", "width", "height"]) if (box[k] !== undefined) node.style[k] = `${box[k]}px`;
};

const stage = document.getElementById("stage");

const captions = tl.captions.map((c) => {
  const box = el("div", "caption", stage);
  el("div", "title", box, c.title);
  if (c.sub) el("div", "sub", box, c.sub);
  return box;
});

const call = el("div", "window call", stage);
place(call, L.call);
const bar = el("div", "bar", call);
for (const color of ["red", "yellow", "green"]) el("span", `light ${color}`, bar);
el("span", "name", bar, script.call.title);
const tile = el("div", "tile", call);
const avatar = el("div", "avatar", tile, script.call.initial);
el("div", "who", tile, `${script.call.speaker} · ${script.call.role}`);
el("div", "self", call, script.call.you);

const overlayFrame = el("iframe", "frame overlay-frame", stage);
place(overlayFrame, L.overlay);
overlayFrame.src = `/overlay.html?demo=1&session=running&empty=1&locked=1&lang=${ui}&size=${L.overlay.fontSize}`;

const chat = el("div", "window chat", stage);
place(chat, L.chat);
const head = el("div", "head", chat);
el("div", "avatar small", head, script.call.initial);
el("div", "contact", head, script.chat.contact);
const thread = el("div", "thread", chat);
const theirs = el("div", "bubble theirs", thread, script.chat.sarahMessage);
const mine = el("div", "bubble mine", thread, tl.compose.text);
const inputBox = el("div", "input", chat);
const inputText = el("div", "text", inputBox);
el("div", "send", inputBox, "➤");

// Ô Gõ dịch: đúng bề rộng thật 560 điểm (compose::WIDTH), thu nhỏ quanh mép trên cho vừa khung chat.
const composeFrame = el("iframe", "frame compose-frame", stage);
composeFrame.src = `/compose.html?demo=1&lang=${ui}&theme=light`;
composeFrame.style.top = `${L.compose.top}px`;
composeFrame.style.left = `${L.chat.left + L.chat.width / 2 - 280}px`;
composeFrame.style.transform = `scale(${L.compose.scale})`;

const hotkey = el("div", "keys", stage);
hotkey.style.top = `${L.keys.top}px`;
const hotkeyCaps = ["⌃", "⌥", "G"].map((k) => el("span", "cap", hotkey, k));
const enterKey = el("div", "keys", stage);
enterKey.style.top = `${L.keys.top}px`;
const enterCap = el("span", "cap wide", enterKey, "⏎ Enter");

const outro = el("div", "outro", stage);
const icon = el("img", "icon", outro);
icon.alt = "";
icon.src = "/src-tauri/icons/128x128@2x.png";
el("div", "name", outro, script.outro.name);
el("div", "tagline", outro, script.outro.tagline);
el("div", "url", outro, script.outro.url);
el("div", "fine", outro, script.outro.fine);

if (q.get("guides") === "1") {
  const s = L.safe;
  for (const box of [
    { left: 0, top: 0, width: 540, height: s.top },
    { left: 0, top: s.bottom, width: 540, height: 960 - s.bottom },
    { left: s.right, top: 0, width: 540 - s.right, height: 960 },
  ]) {
    place(el("div", "guide", stage), box);
  }
}

const show = (node, opacity, shift = "") => {
  node.style.opacity = String(opacity);
  node.style.visibility = opacity > 0 ? "visible" : "hidden";
  node.style.translate = shift;
};
const within = (t, from, to) => t >= from && t < to;
// Bật lên ở `at` (rõ dần trong `ms`), tắt ở `until`.
const pop = (t, at, until = Number.POSITIVE_INFINITY, ms = 160) => (t < at || t >= until ? 0 : Math.min(1, (t - at) / ms));

/** Vẽ đúng hình của thời điểm `t` (ms từ đầu video). */
function render(t) {
  const c = tl.chat;
  tl.captions.forEach((cap, i) => show(captions[i], visibility(t, [cap.from, cap.to])));

  const liveVis = visibility(t, tl.scenes.live);
  show(call, liveVis);
  show(overlayFrame, liveVis);
  const g = Math.min(1, levelAt(voice, tl.voiceStartMs, t) / 0.08);
  avatar.style.boxShadow = `0 0 0 ${4 + 10 * g}px rgba(108, 140, 255, ${0.15 + 0.55 * g})`;

  show(chat, visibility(t, tl.scenes.chat));
  const sarah = pop(t, c.sarahAt, Number.POSITIVE_INFINITY, 200);
  show(theirs, sarah, `0 ${(1 - sarah) * 8}px`);
  const sent = pop(t, c.enter2At + 80, Number.POSITIVE_INFINITY, 200);
  show(mine, sent, `0 ${(1 - sent) * 8}px`);
  const pasted = within(t, c.pasteAt, c.enter2At + 80);
  inputText.textContent = pasted ? tl.compose.text : script.chat.placeholder;
  inputText.classList.toggle("placeholder", !pasted);
  show(composeFrame, pop(t, c.composeOpenAt, c.enter1At + 60, 120));

  show(hotkey, pop(t, c.hotkeyAt - 100, c.hotkeyAt + 900, 120));
  const pressed = within(t, c.pressAt, c.pressAt + 180);
  for (const cap of hotkeyCaps) cap.classList.toggle("down", pressed);
  show(enterKey, Math.max(pop(t, c.enter1At - 120, c.enter1At + 600, 100), pop(t, c.enter2At - 120, c.enter2At + 600, 100)));
  enterCap.classList.toggle("down", within(t, c.enter1At, c.enter1At + 150) || within(t, c.enter2At, c.enter2At + 150));

  show(outro, visibility(t, tl.scenes.outro));
}

const loaded = (node) => new Promise((resolve) => node.addEventListener("load", resolve, { once: true }));
await Promise.all([
  loaded(overlayFrame),
  loaded(composeFrame),
  icon.complete ? Promise.resolve() : loaded(icon),
]);
for (const frame of [overlayFrame, composeFrame]) {
  if (typeof frame.contentWindow.__demoEmit !== "function") throw new Error(`${frame.src}: IPC giả chưa có demo=1`);
  const style = frame.contentDocument.createElement("style");
  style.textContent = FREEZE_CSS;
  frame.contentDocument.head.append(style);
}
await Promise.all([document.fonts.ready, overlayFrame.contentDocument.fonts.ready, composeFrame.contentDocument.fonts.ready]);

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
      for (const d of tl.compose.deltas) setTimeout(() => emit("compose://delta", { id, line: 0, text: d.text, reset: false }), d.after);
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
  render(0);
  window.__stage.ready = true;
} else {
  render(0);
  const play = el("button", "play", document.body, "▶ Phát");
  play.addEventListener("click", () => {
    play.remove();
    const audio = new Audio(`/target/demo-video/voice48.${lang}.wav`);
    const t0 = performance.now();
    start(t0);
    setTimeout(() => void audio.play(), tl.voiceStartMs);
    const frame = () => {
      const t = performance.now() - t0;
      render(t);
      if (t < tl.totalMs) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
