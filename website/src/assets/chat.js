// Khung chat hỗ trợ của website (spec chat hỗ trợ 2026-10-22, mục 3; hợp đồng phía khách: kế hoạch
// 2026-10-22-chat-ho-tro-00-tong-quan). ES module: site.js tải động khi khách bấm bong bóng, cùng chat.css; build.mjs đổi hai
// dòng import dưới đây thành tên file đã băm. Chữ của khách và của chủ dự án luôn gán bằng textContent, không bao giờ innerHTML.
import { MAX_CHARS, COUNT_FROM, browserEnv, createPoller, outcome, validText, normalizeText, charCount } from "./chat-core.js";
import { CHAT, SUPPORT_EMAIL } from "./chat-strings.js";

let env = null;
let t = null;
let lang = "vi";
let opts = null;
let els = null;
let poller = null;
let queue = Promise.resolve();
let lastId = 0; // id lớn nhất đã nhận trong khung (con trỏ `after`)
let loaded = false; // đã lấy lịch sử (?after=0) của cuộc chat hiện tại
let mode = "ready"; // "ready" | "off" (chat tắt) | "closed" (cuộc chat bị chặn)
const seen = new Set(); // id các tin đã vẽ: tin khách gửi xong cũng quay lại trong lần hỏi kế tiếp

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const use = (name) => `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
const DOTS = '<svg class="icon chat-dots" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';

export const isOpen = () => Boolean(els && !els.panel.hidden);

/** Mở khung (site.js gọi). `o`: `{ root, bubble, lang, onClose }`. */
export function openChat(o) {
  opts = o;
  if (!els) build(o.lang);
  els.panel.hidden = false;
  opts.bubble.setAttribute("aria-expanded", "true");
  document.documentElement.classList.add("chat-open");
  els.log.scrollTop = els.log.scrollHeight;
  start();
  // Máy có chuột: tiêu điểm vào ô nhập ngay. Màn hình cảm ứng: không bật bàn phím ảo che khung, tiêu điểm vào nút đóng.
  (mode === "ready" && matchMedia("(pointer: fine)").matches ? els.input : els.close).focus();
}

export function closeChat() {
  if (!isOpen()) return;
  poller.stop();
  hideMenu();
  els.confirm.hidden = true;
  els.panel.hidden = true;
  document.documentElement.classList.remove("chat-open");
  opts.bubble.setAttribute("aria-expanded", "false");
  opts.bubble.focus();
  opts.onClose?.();
}

function build(l) {
  env = browserEnv();
  lang = Object.hasOwn(CHAT, l) ? l : "en";
  t = CHAT[lang];
  const panel = document.createElement("div");
  panel.className = "chat-panel";
  panel.id = "chat-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "chat-title");
  panel.hidden = true;
  panel.innerHTML = `<div class="chat-head">
<div class="chat-titles"><h2 class="chat-title" id="chat-title">${esc(t.title)}</h2><p class="chat-sub">${esc(t.sub)}</p></div>
<button class="chat-icon" type="button" data-menu aria-haspopup="true" aria-expanded="false" aria-controls="chat-menu" aria-label="${esc(t.menu)}">${DOTS}</button>
<button class="chat-icon" type="button" data-close aria-label="${esc(t.close)}">${use("x")}</button>
<div class="chat-menu" id="chat-menu" hidden><button type="button" data-delete>${use("trash")}<span>${esc(t.del)}</span></button></div>
</div>
<div class="chat-log" role="log" aria-labelledby="chat-title"></div>
<div class="chat-confirm" role="group" aria-labelledby="chat-confirm-text" hidden><p id="chat-confirm-text">${esc(t.confirm)}</p><div class="chat-actions"><button type="button" class="chat-btn is-danger" data-yes>${esc(t.confirmYes)}</button><button type="button" class="chat-btn" data-no>${esc(t.confirmNo)}</button></div></div>
<div class="chat-email" hidden>
<p class="chat-email-ask" id="chat-email-ask">${esc(t.emailAsk)}</p>
<button class="chat-icon chat-email-close" type="button" data-email-close aria-label="${esc(t.emailClose)}">${use("x")}</button>
<div class="chat-email-row"><input type="email" autocomplete="email" inputmode="email" maxlength="254" aria-labelledby="chat-email-ask" placeholder="${esc(t.emailLabel)}"><button type="button" class="chat-btn" data-email-save>${esc(t.emailSave)}</button></div>
<p class="chat-email-msg" role="status"></p>
</div>
<p class="chat-note" role="status"></p>
<div class="chat-compose">
<p class="chat-count" id="chat-count" hidden></p>
<label class="sr-only" for="chat-input">${esc(t.inputLabel)}</label>
<textarea id="chat-input" rows="1" placeholder="${esc(t.placeholder)}" aria-describedby="chat-count"></textarea>
<button class="chat-send" type="button" data-send aria-label="${esc(t.send)}" disabled>${use("arrow-right")}</button>
</div>
<p class="chat-off" hidden></p>
<p class="chat-foot">${esc(t.keep)} · <a href="${t.privacyHref}"${lang === "vi" ? "" : ' hreflang="en"'}>${esc(t.privacy)}</a></p>`;
  opts.root.append(panel);
  const q = (s) => panel.querySelector(s);
  els = {
    panel,
    log: q(".chat-log"),
    menuBtn: q("[data-menu]"),
    menu: q(".chat-menu"),
    delBtn: q("[data-delete]"),
    close: q("[data-close]"),
    confirm: q(".chat-confirm"),
    confirmYes: q("[data-yes]"),
    confirmNo: q("[data-no]"),
    email: q(".chat-email"),
    emailRow: q(".chat-email-row"),
    emailInput: q(".chat-email input"),
    emailSave: q("[data-email-save]"),
    emailClose: q("[data-email-close]"),
    emailMsg: q(".chat-email-msg"),
    note: q(".chat-note"),
    compose: q(".chat-compose"),
    count: q(".chat-count"),
    input: q("#chat-input"),
    send: q("[data-send]"),
    off: q(".chat-off"),
  };
  poller = createPoller({ mode: "open", env, tick });
  addMessage("owner", t.greeting);
  els.menuBtn.hidden = !env.store.load();
  wire();
}

function wire() {
  els.close.addEventListener("click", closeChat);
  els.menuBtn.addEventListener("click", toggleMenu);
  els.delBtn.addEventListener("click", askDelete);
  els.confirmYes.addEventListener("click", confirmDelete);
  els.confirmNo.addEventListener("click", () => {
    els.confirm.hidden = true;
    els.menuBtn.focus();
  });
  els.send.addEventListener("click", submit);
  els.input.addEventListener("input", onInput);
  els.input.addEventListener("keydown", (e) => {
    // Enter gửi, Shift+Enter xuống dòng. Đang gõ bằng bộ gõ (IME: tiếng Nhật, Trung, Hàn, Telex) thì Enter là chốt chữ, không gửi.
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  });
  els.emailSave.addEventListener("click", saveEmail);
  els.emailInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    saveEmail();
  });
  els.emailClose.addEventListener("click", () => {
    els.email.hidden = true;
    els.input.focus();
  });
  // Esc: đóng menu, rồi hộp hỏi xóa, rồi cả khung (tiêu điểm về bong bóng).
  opts.root.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !isOpen()) return;
    e.preventDefault();
    if (!els.menu.hidden) {
      hideMenu();
      els.menuBtn.focus();
    } else if (!els.confirm.hidden) {
      els.confirm.hidden = true;
      els.menuBtn.focus();
    } else closeChat();
  });
  document.addEventListener("click", (e) => {
    if (!els.menu.hidden && !els.menu.contains(e.target) && !els.menuBtn.contains(e.target)) hideMenu();
  });
}

/** Mở khung: có cuộc chat thì hỏi tin mới (lần đầu lấy cả lịch sử); chưa có thì chỉ hỏi chat có đang bật không. */
function start() {
  if (env.store.load()) poller.start();
  else checkStatus();
}

function checkStatus() {
  env.api.status().then((r) => {
    if (r.ok && !env.store.load()) setMode(r.data?.enabled === false ? "off" : "ready");
  });
}

async function tick() {
  const st = env.store.load();
  if (!st) {
    poller.stop();
    return { result: { ok: true }, fresh: 0 };
  }
  const first = !loaded;
  if (first) els.log.setAttribute("aria-busy", "true"); // lịch sử hiện một lượt, trình đọc màn hình không đọc từng tin cũ
  const result = await env.api.messages(st.token, first ? 0 : lastId);
  els.log.removeAttribute("aria-busy");
  if (env.store.load()?.token !== st.token) return { result: { ok: true }, fresh: 0 }; // vừa xóa cuộc chat trong lúc chờ
  if (!result.ok) {
    if (outcome(result) === "reset") resetConversation();
    return { result, fresh: 0 };
  }
  loaded = true;
  const { enabled, status, messages = [] } = result.data ?? {};
  let fresh = 0;
  for (const m of messages) {
    lastId = Math.max(lastId, m.id);
    if (seen.has(m.id)) continue;
    addMessage(m.sender, m.text, { id: m.id, state: m.sender === "customer" ? "sent" : null });
    if (m.sender === "owner") fresh += 1;
  }
  setMode(enabled === false ? "off" : status === "closed" ? "closed" : "ready");
  // Khách đang nhìn khung nên đã thấy mọi tin: lastId tiến; còn chờ trả lời chỉ khi tin cuối là của khách.
  const last = messages.at(-1);
  env.store.save({ token: st.token, lastId, waitingSince: last ? (last.sender === "customer" ? last.created_at : null) : st.waitingSince });
  return { result, fresh };
}

function addMessage(sender, text, { id = null, state = null } = {}) {
  const row = document.createElement("div");
  row.className = `chat-msg is-${sender}`;
  const who = document.createElement("span");
  who.className = "sr-only";
  who.textContent = `${sender === "customer" ? t.you : t.support}: `;
  const body = document.createElement("p");
  body.className = "chat-text";
  body.textContent = text;
  row.append(who, body);
  if (id !== null) {
    row.dataset.id = String(id);
    seen.add(id);
  }
  els.log.append(row);
  if (state) setState(row, state);
  els.log.scrollTop = els.log.scrollHeight;
  return row;
}

/** Trạng thái tin của khách: "sending", "sent", hay "failed" (nút bấm để gửi lại đúng nội dung đó). */
function setState(row, state) {
  row.dataset.state = state;
  row.querySelector(".chat-state")?.remove();
  let el;
  if (state === "failed") {
    el = document.createElement("button");
    el.type = "button";
    el.textContent = t.failed;
    el.addEventListener("click", () => retry(row));
  } else {
    el = document.createElement("span");
    el.textContent = state === "sending" ? t.sending : t.sent;
  }
  el.className = "chat-state";
  row.append(el);
}

function submit() {
  const text = validText(els.input.value);
  if (!text || mode !== "ready") return;
  els.input.value = "";
  onInput();
  const row = addMessage("customer", text, { state: "sending" });
  queue = queue.then(() => deliver(text, row));
}

function retry(row) {
  if (mode !== "ready") return;
  setState(row, "sending");
  queue = queue.then(() => deliver(row.querySelector(".chat-text").textContent, row));
}

/** Gửi lần lượt từng tin (tin đầu tạo cuộc chat; tin sau phải đợi có token). */
async function deliver(text, row) {
  const st = env.store.load();
  const result = await env.api.send(st?.token ?? null, text, { lang, source: "web", page: location.pathname });
  poller.report(result);
  if (result.ok) {
    const m = result.data.message;
    row.dataset.id = String(m.id);
    seen.add(m.id);
    setState(row, "sent");
    note("");
    env.store.save({ token: result.data.token ?? st.token, lastId, waitingSince: m.created_at });
    if (!st) {
      // Tin đầu của cuộc chat mới: hiện menu ⋯ và thẻ email.
      loaded = true;
      els.menuBtn.hidden = false;
      els.email.hidden = false;
    }
    if (isOpen()) {
      poller.start({ immediate: false });
      poller.bump();
    } else opts.onClose?.(); // khung đã đóng trong lúc gửi: site.js bắt đầu hỏi 60 giây
    return;
  }
  setState(row, "failed");
  const o = outcome(result);
  if (o === "reset") {
    resetConversation();
    els.log.append(row); // tin chưa gửi vẫn ở đó: bấm "thử lại" thì mở cuộc chat mới
  } else if (o === "closed") setMode("closed");
  else if (o === "disabled") setMode("off");
  else note(o === "busy" ? t.busy : o === "rate" ? t.rate : o === "network" ? t.network : t.invalid);
}

/** Về trạng thái mới (401, hay khách xóa cuộc chat): xóa bản lưu, chỉ còn lời chào. */
function resetConversation() {
  poller.stop();
  env.store.clear();
  seen.clear();
  lastId = 0;
  loaded = false;
  els.log.replaceChildren();
  addMessage("owner", t.greeting);
  els.menuBtn.hidden = true;
  els.email.hidden = true;
  setMode("ready");
  checkStatus();
}

/** Chat tắt hay cuộc chat bị chặn: thay ô nhập bằng dòng email support@ (lịch sử vẫn hiện). */
function setMode(m) {
  mode = m;
  els.compose.hidden = m !== "ready";
  els.off.hidden = m === "ready";
  if (m !== "ready") {
    fillEmail(els.off, m === "off" ? t.off : t.closed);
    els.email.hidden = true;
  }
}

function fillEmail(el, template) {
  const [before, after] = template.split("{email}");
  const a = document.createElement("a");
  a.href = `mailto:${SUPPORT_EMAIL}`;
  a.textContent = SUPPORT_EMAIL;
  el.replaceChildren(before, a, after);
}

/** Dòng báo lỗi dưới khung tin (vùng role=status, đọc một lần khi đổi). */
function note(text) {
  if (text.includes("{email}")) fillEmail(els.note, text);
  else els.note.textContent = text;
}

function onInput() {
  const n = charCount(normalizeText(els.input.value));
  const over = n > MAX_CHARS;
  els.count.hidden = n < COUNT_FROM;
  els.count.textContent = `${n}/${MAX_CHARS}`;
  els.count.classList.toggle("is-over", over);
  els.input.setAttribute("aria-invalid", String(over));
  els.send.disabled = n === 0 || over;
  if (over) note(t.tooLong);
  else if (els.note.textContent === t.tooLong) note("");
  // Ô nhập cao theo nội dung tới khoảng 6 dòng (gán qua CSSOM, không phải thuộc tính style, nên CSP không chặn).
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 150)}px`;
}

async function saveEmail() {
  const value = els.emailInput.value.trim().toLowerCase();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    els.emailMsg.textContent = t.emailBad;
    return;
  }
  const st = env.store.load();
  if (!st) return;
  els.emailSave.disabled = true;
  const result = await env.api.setEmail(st.token, value);
  els.emailSave.disabled = false;
  poller.report(result);
  if (result.ok) {
    els.emailRow.hidden = true;
    els.emailMsg.textContent = t.emailSaved;
    return;
  }
  const o = outcome(result);
  if (o === "reset") resetConversation();
  else if (o === "closed") setMode("closed");
  else els.emailMsg.textContent = o === "invalid" ? t.emailBad : t.emailFail;
}

function toggleMenu() {
  const show = els.menu.hidden;
  els.menu.hidden = !show;
  els.menuBtn.setAttribute("aria-expanded", String(show));
  if (show) els.delBtn.focus();
}

function hideMenu() {
  els.menu.hidden = true;
  els.menuBtn.setAttribute("aria-expanded", "false");
}

function askDelete() {
  hideMenu();
  els.confirm.hidden = false;
  els.confirmNo.focus();
}

async function confirmDelete() {
  const st = env.store.load();
  els.confirmYes.disabled = true;
  const result = st ? await env.api.remove(st.token) : { ok: true };
  els.confirmYes.disabled = false;
  els.confirm.hidden = true;
  // 200 hay 401 (cuộc chat đã không còn): xóa bản lưu, về trạng thái mới. Lỗi khác: giữ nguyên, báo lỗi.
  if (!result.ok && outcome(result) !== "reset") {
    note(t.delFail);
    els.menuBtn.focus();
    return;
  }
  resetConversation();
  note("");
  (mode === "ready" ? els.input : els.close).focus();
}
