// Cửa sổ chat kiểu Messenger trên desktop 2 (không logo, không tên Messenger): danh sách hội thoại, hội thoại với Sarah (tin cũ, chấm
// "đang nhập…", tin mới, tin của mình gửi bằng Gõ dịch, lời đáp), ô nhập. Tin hiện ra thì đẩy tin cũ lên như app thật.
import { avatar, el, icon, place, titleBar, within } from "./desktop-dom.mjs";

function message(thread, from, text, contact, assets) {
  const row = el("div", `msg ${from}`, thread);
  if (from === "them") avatar(row, contact, assets, "xs");
  el("div", "bubble", row, text);
  return row;
}

function typingBubble(thread, contact, assets) {
  const row = el("div", "msg them typing", thread);
  avatar(row, contact, assets, "xs");
  const bubble = el("div", "bubble", row);
  return { row, dots: [0, 1, 2].map(() => el("i", "dot", bubble)) };
}

// Hiện (rõ dần 180 ms, trồi lên 6 điểm) hay ẩn hẳn khỏi luồng tin.
function appear(node, visible, since) {
  node.style.display = visible ? "" : "none";
  if (!visible) return;
  const p = Math.min(1, since / 180);
  node.style.opacity = String(p);
  node.style.transform = `translateY(${(1 - p) * 6}px)`;
}

export function buildChat(parent, { script, tl, assets }) {
  const L = script.layout.chat;
  const C = script.chat;
  const win = el("div", "window chat", parent);
  place(win, L);
  titleBar(win, C.title, "light", "chat");
  const body = el("div", "chat-body", win);

  const list = el("div", "chat-list", body);
  list.style.width = `${L.listWidth}px`;
  el("div", "list-title", list, "Đoạn chat");
  const search = el("div", "search", list);
  icon("search", search);
  el("span", "", search, "Tìm kiếm");
  let activeLast = null;
  for (const item of C.list) {
    const row = el("div", item.active ? "row active" : "row", list);
    avatar(row, item, assets, "md");
    const text = el("div", "row-text", row);
    el("div", "row-name", text, item.name);
    const last = el("div", "row-last", text, item.last ?? "");
    if (item.active) activeLast = last;
    el("div", "row-time", row, item.time);
  }

  const pane = el("div", "chat-pane", body);
  const head = el("div", "pane-head", pane);
  el("i", "online", avatar(head, C.contact, assets, "sm"));
  const who = el("div", "pane-who", head);
  el("div", "pane-name", who, C.contact.name);
  el("div", "pane-status", who, C.contact.status);
  const actions = el("div", "pane-actions", head);
  for (const n of ["phone", "cam", "info"]) icon(n, actions);

  const thread = el("div", "thread", pane);
  el("div", "day", thread, C.historyDay);
  for (const m of C.history) message(thread, m.from, m.text, C.contact, assets);
  el("div", "day", thread, C.todayDay);
  const typing1 = typingBubble(thread, C.contact, assets);
  const incoming = message(thread, "them", C.sarahMessage, C.contact, assets);
  const outgoing = message(thread, "me", tl.compose.text, C.contact, assets);
  const typing2 = typingBubble(thread, C.contact, assets);
  const reply = message(thread, "them", C.sarahReply, C.contact, assets);

  const composer = el("div", "composer", pane);
  for (const n of ["plus", "image", "smile"]) icon(n, composer);
  const input = el("div", "input", composer);
  const inputText = el("span", "", input);
  icon("send", composer);

  const lastOfHistory = C.history.at(-1);
  const lastLine = (from, text) => (from === "me" ? `Bạn: ${text}` : text);
  const dotsAt = (dots, t) =>
    dots.forEach((d, k) => {
      const wave = 0.5 + 0.5 * Math.sin((t / 1000) * 2 * Math.PI * 1.6 - k * 0.9);
      d.style.opacity = String(0.35 + 0.65 * wave);
      d.style.transform = `translateY(${-2 * wave}px)`;
    });

  return {
    render(t) {
      const c = tl.chat;
      appear(typing1.row, within(t, c.typing1[0], c.typing1[1]), t - c.typing1[0]);
      dotsAt(typing1.dots, t);
      appear(incoming, t >= c.sarahAt, t - c.sarahAt);
      appear(outgoing, t >= c.sentAt, t - c.sentAt);
      appear(typing2.row, within(t, c.typing2[0], c.typing2[1]), t - c.typing2[0]);
      dotsAt(typing2.dots, t);
      appear(reply, t >= c.replyAt, t - c.replyAt);
      const pasted = within(t, c.pasteAt, c.sentAt);
      inputText.textContent = pasted ? tl.compose.text : C.placeholder;
      inputText.className = pasted ? "" : "placeholder";
      input.classList.toggle("focused", t >= c.clickAt);
      activeLast.textContent =
        t >= c.replyAt
          ? C.sarahReply
          : t >= c.sentAt
            ? lastLine("me", tl.compose.text)
            : t >= c.sarahAt
              ? C.sarahMessage
              : lastLine(lastOfHistory.from, lastOfHistory.text);
    },
  };
}
