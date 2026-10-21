// Hàm dựng DOM dùng chung của trang dựng cảnh bản 16:10 (desktop.mjs và các phần desktop-*.mjs). Biểu tượng vẽ tay bằng SVG 24×24
// (nét 1,8, xem desktop.css), không lấy từ bộ biểu tượng của hãng nào, không logo.

export const el = (tag, cls, parent, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
};

export const place = (node, box) => {
  for (const k of ["left", "top", "width", "height"]) if (box[k] !== undefined) node.style[k] = `${box[k]}px`;
};

/** Độ hiện và biến đổi của một phần tử; độ hiện 0 thì ẩn hẳn. */
export const show = (node, opacity, transform = "") => {
  node.style.opacity = String(opacity);
  node.style.visibility = opacity > 0 ? "visible" : "hidden";
  node.style.transform = transform;
};

export const within = (t, from, to) => t >= from && t < to;

/** Bật lên ở `at` (rõ dần trong `ms`), tắt ở `until`. */
export const pop = (t, at, until = Number.POSITIVE_INFINITY, ms = 160) => (t < at || t >= until ? 0 : Math.min(1, (t - at) / ms));

const dots3x3 = [6, 12, 18].flatMap((y) => [6, 12, 18].map((x) => `<circle cx="${x}" cy="${y}" r="1.7" fill="currentColor" stroke="none"/>`)).join("");

const ICONS = {
  apps: dots3x3,
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  cam: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  chevron: '<path d="M6 15l6-6 6 6"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  battery: '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4"/><rect x="4" y="9" width="11" height="6" rx="1" fill="currentColor" stroke="none"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micOff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16"/>',
  share: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 14V8M9 11l3-3 3 3M8 21h8"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.3-1.9L8 14"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  leave: '<path d="M3 14c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-7 0V15l-3 1.5z"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5 5"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 10v.01M15 10v.01"/>',
  send: '<path d="M3 11l18-8-8 18-2-8z"/>',
  winMin: '<path d="M5 12h14"/>',
  winMax: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  winClose: '<path d="M6 6l12 12M18 6L6 18"/>',
};

/** Biểu tượng `name` trong một `<span class={cls}>`. */
export function icon(name, parent, cls = "icon") {
  const svg = ICONS[name];
  if (svg === undefined) throw new Error(`không có biểu tượng ${name}`);
  const node = el("span", cls, parent);
  node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>`;
  return node;
}

/** Thanh tiêu đề kiểu Windows 11: biểu tượng app, tên cửa sổ, ba nút – □ ✕ bên phải. */
export function titleBar(win, title, theme, iconName) {
  const bar = el("div", `titlebar ${theme}`, win);
  icon(iconName, bar, "icon app-ico");
  el("span", "title", bar, title);
  for (const n of ["winMin", "winMax", "winClose"]) icon(n, bar, "icon wbtn");
  return bar;
}

/** Ảnh đại diện tròn: ảnh tách từ clip (`still`) hay chữ viết tắt (`initials`). */
export function avatar(parent, who, assets, size) {
  const box = el("div", `avatar ${size}`, parent);
  if (who.still) {
    const img = el("img", "", box);
    img.alt = "";
    img.src = assets.still(who.still);
  } else {
    box.textContent = who.initials;
  }
  return box;
}
