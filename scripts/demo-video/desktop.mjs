// Trang dựng cảnh bản 16:10 (spec 2026-10-21-demo-video-desktop §2.3 & spec 2026-11-06-video-marketing-tong-hop):
// màn hình Windows 11 giả 1536×960 điểm CSS (render.mjs chụp ở mật độ 1,25 → 1920×1200).
// - Bản `desktop.*`: 2 desktop ảo (cuộc họp → chat).
// - Bản `showcase.*`: 3 desktop ảo (cuộc họp + Nghe dịch + màn hình Giọng đọc → trình duyệt phát video 16:9 → Gõ dịch trên Messenger).
//   http://127.0.0.1:1432/scripts/demo-video/desktop.html?script=desktop.vi
//   http://127.0.0.1:1432/scripts/demo-video/desktop.html?script=showcase.vi
import { buildChat } from "./desktop-chat.mjs";
import { el, place, pop, show, titleBar } from "./desktop-dom.mjs";
import { composeBox, overlayBox, pingPong } from "./desktop-layout.mjs";
import { buildMeeting } from "./desktop-meeting.mjs";
import { buildShell } from "./desktop-shell.mjs";
import { SLIDE_MS, buildDesktopTimeline, ease } from "./desktop-timeline.mjs";
import { buildYoutube } from "./desktop-youtube.mjs";
import { dataName, fontStack, htmlLang, voiceName } from "./names.mjs";
import { buildShowcaseTimeline } from "./showcase-timeline.mjs";

const q = new URLSearchParams(location.search);
const name = q.get("script") ?? "desktop.vi";
const load = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`không tải được ${url} (${r.status})`);
  return r.json();
};
const here = (file) => new URL(file, import.meta.url).href;
const script = await load(here(`./script.${name}.json`));
const isShowcase = script.stage === "showcase";
// Bộ chữ thật và bản thu: xem names.mjs (bản ja/zh/ko dùng lại bản thu tiếng Anh của bản vi).
const d = dataName(script, name);
const v = voiceName(script, name);

const [voice, live, compose, frameIndex] = await Promise.all([
  load(here(`./data/voice.${v}.json`)),
  load(here(`./data/live.${d}.json`)),
  load(here(`./data/compose.${d}.json`)),
  load("/target/demo-video/frames/index.json"),
]);

let ytVoice = null;
let ytLive = null;
let ttsMeta = null;
if (isShowcase) {
  [ytVoice, ytLive, ttsMeta] = await Promise.all([
    load(here(`./data/voice.youtube.${v}.json`)),
    load(here(`./data/youtube.${d}.json`)),
    load(here(`./data/tts.showcase.${d}.json`)),
  ]);
}

const tl = isShowcase
  ? buildShowcaseTimeline(script, voice, live, ytVoice, ytLive, compose, ttsMeta)
  : buildDesktopTimeline(script, voice, live, compose);

const L = script.layout;
const ui = script.target;
// Chrome chọn phông dự phòng cho chữ Hán theo `lang` của trang (kanji kiểu Nhật ở bản ja); desktop.css đổi --font theo nó.
document.documentElement.lang = htmlLang(ui);
// Phần cài đặt mà phía Rust gửi kèm `compose://open` (ComposeView của src/lib/ipc.ts): app chạy trên Windows.
const COMPOSE_VIEW = { uiLanguage: ui, theme: "light", target: script.chat.replyTarget, autoPaste: true, blocked: null, platform: "windows" };
// Trong các iframe: font "Demo UI" như app trên Windows (Segoe UI), tắt transition/animation và con trỏ nhấp nháy (chạy theo giờ thật).
const IFRAME_CSS = `*,*::before,*::after{transition:none!important;animation:none!important;font-family:${fontStack(ui)}!important}textarea{caret-color:transparent!important}.overlay.unlocked .lines{padding-top:2.4rem!important;-webkit-mask-image:linear-gradient(transparent 0px,transparent 34px,#000 46px)!important;mask-image:linear-gradient(transparent 0px,transparent 34px,#000 46px)!important}`;

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
const ctx = { script, tl, voice, ytVoice, assets };

const screen = document.getElementById("screen");
const desks = el("div", isShowcase ? "desks three" : "desks", screen);
const desk1 = el("div", "desk", desks);
const desk2 = el("div", "desk d2", desks);
const desk3 = isShowcase ? el("div", "desk d3", desks) : null;

const meeting = buildMeeting(desk1, ctx);
const overlayFrame = el("iframe", "frame overlay-frame", desk1);
place(overlayFrame, overlayBox(L));
overlayFrame.src = `/overlay.html?demo=1&session=running&empty=1&locked=1&platform=windows&lang=${ui}&size=${L.overlay.fontSize}${isShowcase ? "&tts=1" : ""}`;

let mainWin = null;
let mainFrame = null;
let youtube = null;
let ytOverlayFrame = null;

if (isShowcase) {
  mainWin = el("div", "window main-win", desk1);
  place(mainWin, L.mainWindow);
  titleBar(mainWin, "AI Translator — Giọng đọc", "light", "volume");
  mainFrame = el("iframe", "frame main-frame", mainWin);
  mainFrame.src = `/index.html?demo=1&tts=1&platform=windows&lang=${ui}&screen=voice&theme=light`;

  youtube = buildYoutube(desk2, ctx);
  ytOverlayFrame = el("iframe", "frame overlay-frame", desk2);
  place(ytOverlayFrame, overlayBox(L));
  ytOverlayFrame.src = `/overlay.html?demo=1&tts=1&session=running&empty=1&locked=1&platform=windows&lang=${ui}&size=${L.overlay.fontSize}`;
}

const chat = buildChat(isShowcase ? desk3 : desk2, ctx);
const composeFrame = el("iframe", "frame compose-frame", screen);
place(composeFrame, { ...composeBox(L, script.viewport), height: 320 });
composeFrame.src = `/compose.html?demo=1&platform=windows&lang=${ui}&theme=light`;
const shell = buildShell(screen, ctx);

/** Vẽ đúng hình của thời điểm `t` (ms từ đầu video); đợi ảnh clip của khung đã giải mã. */
async function render(t) {
  if (isShowcase) {
    const [s1a, s1b] = tl.scenes.slide1;
    const [s2a, s2b] = tl.scenes.slide2;
    let p = 0;
    if (t <= s1a) p = 0;
    else if (t < s1b) p = ease((t - s1a) / SLIDE_MS);
    else if (t <= s2a) p = 1;
    else if (t < s2b) p = 1 + ease((t - s2a) / SLIDE_MS);
    else p = 2;
    desks.style.transform = `translateX(${-script.viewport.width * p}px)`;
    show(
      mainWin,
      pop(t, tl.meeting.voiceModalOpenAt, tl.meeting.voiceModalCloseAt, 180),
    );
    await youtube.render(t);
  } else {
    const [a, b] = tl.scenes.slide;
    const p = t <= a ? 0 : t >= b ? 1 : ease((t - a) / SLIDE_MS);
    desks.style.transform = `translateX(${-script.viewport.width * p}px)`;
  }
  chat.render(t);
  show(composeFrame, pop(t, tl.chat.composeOpenAt, tl.chat.enter1At + 60, 120));
  shell.render(t);
  await meeting.render(t);
}

const loaded = (node) => new Promise((resolve) => node.addEventListener("load", resolve, { once: true }));
const frames = isShowcase
  ? [overlayFrame, ytOverlayFrame, mainFrame, composeFrame]
  : [overlayFrame, composeFrame];

await Promise.all(frames.map((f) => loaded(f)));
for (const frame of frames) {
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

const log = { translateAt: [], listenClickAt: [], voicePreviewClickAt: [] };
const overlayEmit = (event, payload) => overlayFrame.contentWindow.__demoEmit(event, payload);
const ytOverlayEmit = (event, payload) => ytOverlayFrame?.contentWindow.__demoEmit(event, payload);
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
  let meetSpeakCount = 0;
  // Phía Rust của Gõ dịch và Giọng đọc: trả bản dịch thật (compose.json) về dần, và trả thời lượng đọc thật cho nút TTS.
  window.__demo = {
    composeTranslate(id, emit) {
      log.translateAt.push(performance.now() - t0);
      for (const delta of tl.compose.deltas) {
        setTimeout(() => emit("compose://delta", { id, line: 0, text: delta.text, reset: false }), delta.after);
      }
      setTimeout(() => emit("compose://done", { id, outcome: { kind: "translated", text: tl.compose.text } }), tl.compose.totalMs);
    },
    ttsSpeak({ text }) {
      if (!isShowcase || !ttsMeta) return 1800;
      if (text?.startsWith("Chúng ta cần hoãn")) return Math.max(400, (ttsMeta.meet0Ms ?? 3300) - 60);
      if (text?.startsWith("Đội ngũ thiết kế")) return Math.max(400, ttsMeta.meet1Ms - 60);
      if (text?.startsWith("Bạn có thể gửi")) return Math.max(400, ttsMeta.meet2Ms - 60);
      if (text?.startsWith("Xin chào")) return Math.max(400, ttsMeta.previewMs + 490);
      if (text?.startsWith("Chào mừng quý vị")) return Math.max(400, (ttsMeta.yt0Ms ?? 3200) - 60);
      if (text?.startsWith("Hôm nay chúng ta")) return 60;
      if (text?.startsWith("Nhờ trí tuệ nhân tạo")) return Math.max(400, ttsMeta.yt1Ms - 60);
      meetSpeakCount += 1;
      return 1800;
    },
  };

  for (const e of tl.overlayEvents) {
    if (isShowcase && e.event === "__demo://unlock-overlay") {
      at(e.at, () => {
        overlayEmit("overlay://view", {
          uiLanguage: ui,
          fontSize: L.overlay.fontSize,
          lines: 3,
          opacity: 0.6,
          textColor: "white",
          background: "black",
          showSource: true,
          locked: false,
          translateWhileSpeaking: true,
          captureMode: "playback",
          targetLanguage: ui,
        });
      });
    } else if (isShowcase && e.event === "__demo://unlock-yt-overlay") {
      at(e.at, () => {
        ytOverlayEmit("overlay://view", {
          uiLanguage: ui,
          fontSize: L.overlay.fontSize,
          lines: 3,
          opacity: 0.6,
          textColor: "white",
          background: "black",
          showSource: true,
          locked: false,
          translateWhileSpeaking: true,
          captureMode: "playback",
          targetLanguage: ui,
        });
      });
    } else if (isShowcase && e.event === "__demo://reset-overlay") {
      // ytOverlayFrame trên desk2 đã sẵn trống và khóa
    } else if (isShowcase && e.at >= tl.scenes.slide1[0]) {
      at(e.at, () => ytOverlayEmit(e.event, e.payload));
    } else {
      at(e.at, () => overlayEmit(e.event, e.payload));
    }
  }

  if (isShowcase) {
    at(tl.meeting.listenClickAt, () => {
      log.listenClickAt.push(performance.now() - t0);
      const btn = overlayFrame.contentDocument.querySelector(".listen-toggle");
      btn?.click();
      setTimeout(() => {
        const range = overlayFrame.contentDocument.querySelector(".listen-level input[type=range]");
        if (range) {
          const rw = overlayFrame.contentWindow;
          Object.getOwnPropertyDescriptor(rw.HTMLInputElement.prototype, "value")?.set?.call(range, "18");
          range.dispatchEvent(new rw.Event("change", { bubbles: true }));
        }
      }, 30);
    });
    // Sau khi tiếng click bật Nghe dịch vang xong, mới đọc câu vừa chốt trên màn hình (id=1):
    at(tl.meeting.ttsMeet0StartAt, () => {
      const ttsBtns = overlayFrame.contentDocument.querySelectorAll(".tts-btn");
      ttsBtns[ttsBtns.length - 1]?.click();
    });
    at(tl.meeting.voiceSelectAt, () => {
      const sel = mainFrame.contentDocument.querySelector("#voice-vi");
      if (sel) {
        const mw = mainFrame.contentWindow;
        Object.getOwnPropertyDescriptor(mw.HTMLSelectElement.prototype, "value")?.set?.call(sel, "Ngọc Huyền");
        sel.dispatchEvent(new mw.Event("change", { bubbles: true }));
      }
    });
    at(tl.meeting.voicePreviewClickAt, () => {
      log.voicePreviewClickAt.push(performance.now() - t0);
      const btn = mainFrame.contentDocument.querySelector("#voice-vi")?.closest(".voice-pick")?.querySelector(".tts-btn");
      btn?.click();
    });
    at(tl.youtube.listenClickAt, () => {
      const btn = ytOverlayFrame.contentDocument.querySelector(".listen-toggle");
      btn?.click();
      // Khi vừa bấm nút bật Nghe dịch trên YouTube, đọc ngay câu đầu vừa chốt (id=10) không trễ:
      const ttsBtns = ytOverlayFrame.contentDocument.querySelectorAll(".tts-btn");
      ttsBtns[ttsBtns.length - 1]?.click();
      setTimeout(() => {
        const range = ytOverlayFrame.contentDocument.querySelector(".listen-level input[type=range]");
        if (range) {
          const rw = ytOverlayFrame.contentWindow;
          Object.getOwnPropertyDescriptor(rw.HTMLInputElement.prototype, "value")?.set?.call(range, "20");
          range.dispatchEvent(new rw.Event("change", { bubbles: true }));
        }
      }, 30);
    });
  }

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
    const audio = new Audio(isShowcase ? `/target/demo-video/audio.${name}.wav` : `/target/demo-video/voice48.${v}.wav`);
    const t0 = performance.now();
    start(t0);
    setTimeout(() => void audio.play(), isShowcase ? 0 : tl.voiceStartMs);
    const frame = async () => {
      const t = performance.now() - t0;
      await render(t);
      if (t < tl.totalMs) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
