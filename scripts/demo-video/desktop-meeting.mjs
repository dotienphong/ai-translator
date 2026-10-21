// Cửa sổ app họp phóng to trên desktop 1 (không logo, không tên Teams/Meet): thanh tiêu đề Windows, thanh thông tin (tên cuộc họp,
// thời lượng), lưới 2×2, thanh điều khiển. Mỗi ô: tắt cam với ảnh đại diện (`still`) hay chữ viết tắt (`initials`), hoặc bật cam
// (`video`: ảnh JPEG của đúng khung). Người nói (`speaker`) có mic bật, viền sáng và sóng âm khi nói. `render(t)` đợi các ảnh của
// khung đã giải mã.
import { meetingTiles } from "./desktop-layout.mjs";
import { el, icon, place, titleBar } from "./desktop-dom.mjs";
import { FRAME_MS, levelAt } from "./timeline.mjs";

// Viền "đang nói" giữ thêm chừng này sau tiếng cuối, để không nháy giữa các từ.
const SPEAK_HOLD_MS = 300;

export function buildMeeting(parent, { script, tl, voice, assets }) {
  const L = script.layout;
  const win = el("div", "window meeting", parent);
  place(win, { left: 0, top: 0, width: L.workArea.width, height: L.workArea.height });
  titleBar(win, script.call.title, "dark", "cam");
  const top = el("div", "meet-top", win);
  el("span", "meet-name", top, script.call.title);
  const timer = el("span", "meet-timer", top);
  const right = el("div", "meet-top-right", top);
  icon("people", right);
  el("span", "", right, String(script.call.people.length));
  icon("chat", right);

  const feeds = [];
  let speaker = null;
  meetingTiles(L).forEach((box, i) => {
    const person = script.call.people[i];
    const tile = el("div", "tile", win);
    place(tile, box);
    if (person.video) {
      const img = el("img", "feed", tile);
      img.alt = "";
      feeds.push({ img, name: person.video });
    } else if (person.still) {
      const portrait = el("img", "portrait", tile);
      portrait.alt = "";
      portrait.src = assets.still(person.still);
      if (person.speaker) speaker = { tile, ring: portrait };
    } else {
      el("div", "initials", tile, person.initials);
    }
    const tag = el("div", "name-tag", tile);
    icon(person.speaker ? "mic" : "micOff", tag, "icon");
    el("span", "", tag, person.name);
    if (person.speaker) speaker.bars = [0, 1, 2].map(() => el("i", "bar", tag));
  });
  if (!speaker) throw new Error("call.people cần đúng một người nói (speaker: true, có still)");

  const controls = el("div", "meet-controls", win);
  el("span", "meet-clock", controls, script.taskbar.time);
  const buttons = el("div", "meet-buttons", controls);
  icon("micOff", buttons, "icon btn muted");
  for (const n of ["cam", "share", "hand", "more"]) icon(n, buttons, "icon btn");
  const leave = el("div", "leave", buttons);
  icon("leave", leave);
  el("span", "", leave, "Rời");

  return {
    async render(t) {
      if (t >= tl.scenes.slide[1]) return; // desktop 1 đã trượt khỏi màn hình
      const secs = script.call.startClock + Math.floor(t / 1000);
      timer.textContent = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
      let level = 0;
      for (let back = 0; back <= SPEAK_HOLD_MS; back += 100) level = Math.max(level, levelAt(voice, tl.voiceStartMs, t - back));
      const g = Math.min(1, levelAt(voice, tl.voiceStartMs, t) / 0.06);
      speaker.ring.style.boxShadow = `0 0 0 ${3 + 9 * g}px rgba(91, 140, 255, ${0.25 + 0.6 * g})`;
      speaker.tile.classList.toggle("speaking", level > 0.009);
      speaker.bars.forEach((b, k) => (b.style.height = `${4 + Math.round(10 * g * [0.6, 1, 0.75][k])}px`));
      const i = Math.floor(t / FRAME_MS + 1e-6);
      const waits = [];
      for (const f of feeds) {
        const src = assets.frame(f.name, i);
        if (f.img.getAttribute("src") === src) continue;
        f.img.src = src;
        waits.push(f.img.decode().catch(() => {}));
      }
      await Promise.all(waits);
    },
  };
}
