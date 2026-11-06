// Vỏ Windows của bản 16:10: thanh tác vụ (biểu tượng app chung chung, không logo Windows; khay có biểu tượng AI Translator), nhãn nhỏ,
// ô hiện phím, con trỏ chuột, màn kết. Mọi thứ theo thời điểm `t`.
import { cursorAt, SLIDE_MS } from "./desktop-timeline.mjs";
import { el, icon, pop, show, within } from "./desktop-dom.mjs";
import { visibility } from "./timeline.mjs";

const ARROW =
  '<svg class="arrow" width="20" height="28" viewBox="0 0 20 28"><path d="M2 2v20l5-5 3.5 8 3.5-1.5-3.5-8H17z" fill="#ffffff" stroke="#000000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const IBEAM =
  '<svg class="text" width="16" height="28" viewBox="0 0 16 28"><path d="M4 3h8M4 25h8M8 3v22" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/><path d="M4 3h8M4 25h8M8 3v22" stroke="#000000" stroke-width="1.6" stroke-linecap="round"/></svg>';

export function buildShell(parent, { script, tl, assets }) {
  const bar = el("div", "taskbar", parent);
  const apps = el("div", "tb-apps", bar);
  const app = {};
  for (const n of ["apps", "search", "folder", "globe", "cam", "chat", "mail"]) app[n] = icon(n, el("div", `tb-app app-${n}`, apps)).parentElement;
  const tray = el("div", "tb-tray", bar);
  icon("chevron", tray, "icon tray-ico");
  const ai = el("img", "tray-app", tray);
  ai.alt = "";
  ai.src = assets.icon;
  for (const n of ["wifi", "volume", "battery"]) icon(n, tray, "icon tray-ico");
  const clock = el("div", "tb-clock", tray);
  el("div", "", clock, script.taskbar.time);
  el("div", "", clock, script.taskbar.date);

  const labels = tl.labels.map((l) => {
    const box = el("div", "label", parent);
    const img = el("img", "", box);
    img.alt = "";
    img.src = assets.icon;
    el("span", "", box, l.text);
    return box;
  });
  const introCards = (tl.introCards ?? []).map((c) => {
    const backdrop = el("div", "intro-backdrop", parent);
    const card = el("div", "intro-card", backdrop);
    const top = el("div", "intro-top", card);
    const logo = el("img", "intro-logo", top);
    logo.alt = "";
    logo.src = assets.appIcon;
    el("span", "intro-step", top, c.step);
    el("div", "intro-title", card, c.title);
    el("div", "intro-desc", card, c.desc);
    return backdrop;
  });
  const keys = tl.keys.map((k) => {
    const box = el("div", "keys", parent);
    const caps = k.keys.map((key, j) => {
      if (j > 0) el("span", "plus", box, "+");
      return el("span", "cap", box, key);
    });
    return { box, caps };
  });
  const cursor = el("div", "cursor", parent);
  cursor.innerHTML = ARROW + IBEAM;
  const outro = el("div", "outro", parent);
  const logo = el("img", "", outro);
  logo.alt = "";
  logo.src = assets.appIcon;
  el("div", "name", outro, script.outro.name);
  el("div", "url", outro, script.outro.url);

  return {
    render(t) {
      if (tl.scenes.youtube) {
        const inYt = t >= tl.scenes.slide1[0] + SLIDE_MS / 2 && t < tl.scenes.slide2[0] + SLIDE_MS / 2;
        const inChat = t >= tl.scenes.slide2[0] + SLIDE_MS / 2;
        app.cam.classList.toggle("active", !inYt && !inChat);
        app.globe.classList.toggle("active", inYt);
        app.chat.classList.toggle("active", inChat);
      } else {
        const inChat = t >= tl.scenes.slide[0] + SLIDE_MS / 2;
        app.cam.classList.toggle("active", !inChat);
        app.chat.classList.toggle("active", inChat);
      }
      tl.labels.forEach((l, i) => show(labels[i], visibility(t, [l.from, l.to])));
      (tl.introCards ?? []).forEach((c, i) => {
        const v = visibility(t, [c.from, c.to], 280);
        const scale = 0.96 + 0.04 * v;
        show(introCards[i], v, `scale(${scale.toFixed(4)})`);
      });
      tl.keys.forEach((k, i) => {
        show(keys[i].box, pop(t, k.from, k.to, 120));
        for (const cap of keys[i].caps) cap.classList.toggle("down", within(t, k.down[0], k.down[1]));
      });
      const p = cursorAt(tl.cursorPath, t);
      cursor.style.left = `${p.x}px`;
      cursor.style.top = `${p.y}px`;
      cursor.dataset.kind = p.kind;
      show(outro, visibility(t, tl.scenes.outro));
    },
  };
}
