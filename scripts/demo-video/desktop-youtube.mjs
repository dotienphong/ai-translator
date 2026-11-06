// Giao diện trang xem video YouTube 16:9 trên trình duyệt: thanh địa chỉ youtube.com, thanh đầu trang YouTube (logo nút Play đỏ +
// YouTube VN, ô tìm kiếm, nút Tạo, thông báo), khung phát video 16:9 (clip diễn giả 30fps + slide thuyết trình + thanh tua đỏ YouTube),
// thông tin kênh/nút Đăng ký/Thích/Chia sẻ và cột video đề xuất bên phải.
import { el, icon, place, titleBar } from "./desktop-dom.mjs";
import { FRAME_MS, levelAt } from "./timeline.mjs";

const THUMBS = ["sarah", "p2-still", "self-still"];
const DURATIONS = ["14:20", "22:05", "09:45"];

export function buildYoutube(parent, { script, tl, ytVoice, assets }) {
  const L = script.layout;
  const y = script.youtube;
  const box = L.youtube;

  const win = el("div", "window yt-win", parent);
  place(win, box);
  titleBar(win, y.browserTitle, "light", "globe");

  // 1. Thanh địa chỉ trình duyệt (URL youtube.com)
  const nav = el("div", "yt-nav", win);
  const navBtns = el("div", "yt-nav-btns", nav);
  el("span", "yt-nav-ico", navBtns, "←");
  el("span", "yt-nav-ico", navBtns, "→");
  el("span", "yt-nav-ico", navBtns, "↻");
  const navUrl = el("div", "yt-url", nav);
  icon("globe", navUrl, "icon yt-url-ico");
  el("span", "yt-url-domain", navUrl, "youtube.com");
  el("span", "yt-url-path", navUrl, "/watch?v=global-product-keynote-2026");

  // 2. Thanh đầu trang YouTube (Masthead)
  const masthead = el("div", "yt-masthead", win);
  const brand = el("div", "yt-brand", masthead);
  el("span", "yt-burger", brand, "☰");
  const logoBadge = el("span", "yt-logo-badge", brand);
  el("span", "yt-logo-tri", logoBadge, "▶");
  el("span", "yt-logo-text", brand, "YouTube");
  el("sup", "yt-logo-country", brand, "VN");

  const searchWrap = el("div", "yt-search-wrap", masthead);
  const searchBox = el("div", "yt-search-box", searchWrap);
  el("span", "yt-search-query", searchBox, "Global Product Keynote 2026");
  const searchBtn = el("div", "yt-search-btn", searchWrap);
  icon("search", searchBtn, "icon");
  const micBtn = el("div", "yt-mic-btn", searchWrap);
  icon("mic", micBtn, "icon");

  const mastRight = el("div", "yt-mast-right", masthead);
  el("div", "yt-create-pill", mastRight, "+ Tạo");
  const bellWrap = el("div", "yt-bell-wrap", mastRight);
  el("span", "yt-bell-ico", bellWrap, "🔔");
  el("span", "yt-bell-badge", bellWrap, "3");
  el("div", "yt-user-avatar", mastRight, "B");

  // 3. Thân trang YouTube: cột trái (trình phát 16:9 + thông tin video) và cột phải (video đề xuất)
  const body = el("div", "yt-body", win);
  const main = el("div", "yt-main", body);

  const player = el("div", "yt-player", main);
  const stage = el("div", "yt-stage", player);

  // Cột trái trong khung phát 16:9: video diễn giả thật 30fps
  const speakerCard = el("div", "yt-speaker-card", stage);
  const videoWrap = el("div", "yt-video-wrap", speakerCard);
  const videoFeed = el("img", "yt-video-feed", videoWrap);
  videoFeed.alt = "";
  videoFeed.src = assets.still("p1-still");
  const liveBadge = el("div", "yt-live-pill", videoWrap);
  el("span", "yt-live-dot", liveBadge);
  el("span", "", liveBadge, "KEYNOTE STREAM");

  const speakerTag = el("div", "yt-speaker-tag", videoWrap);
  icon("mic", speakerTag, "icon");
  el("span", "", speakerTag, "David Park · Keynote Speaker");
  const waveBars = [0, 1, 2, 3, 4].map(() => el("i", "yt-wave-bar", speakerTag));

  // Cột phải trong khung phát 16:9: slide thuyết trình
  const slideCard = el("div", "yt-slide-card", stage);
  el("div", "yt-slide-badge", slideCard, y.slideBadge);
  el("div", "yt-slide-headline", slideCard, y.slideHeadline);
  const pointsWrap = el("div", "yt-slide-points", slideCard);
  const pointNodes = y.slidePoints.map((pt, idx) => {
    const row = el("div", "yt-slide-point", pointsWrap);
    el("span", "yt-point-num", row, `0${idx + 1}`);
    el("span", "yt-point-text", row, pt);
    return row;
  });

  // Thanh điều khiển trình phát YouTube (thanh tua đỏ #ff0000 + chấm tròn đỏ + CC + HD)
  const controls = el("div", "yt-controls", player);
  const progTrack = el("div", "yt-progress", controls);
  const progBuf = el("div", "yt-progress-buf", progTrack);
  const progFill = el("div", "yt-progress-fill", progTrack);
  const progDot = el("div", "yt-progress-dot", progTrack);
  const ctrlRow = el("div", "yt-ctrl-row", controls);
  const ctrlLeft = el("div", "yt-ctrl-left", ctrlRow);
  const playIco = el("span", "yt-play-ico", ctrlLeft, "❚❚");
  el("span", "yt-next-ico", ctrlLeft, "⏭");
  icon("volume", ctrlLeft, "icon");
  const timeText = el("span", "yt-time", ctrlLeft, "04:12 / 12:45");
  el("span", "yt-chapter", ctrlLeft, "• Seamless Cross-Border Collaboration ›");
  const ctrlRight = el("div", "yt-ctrl-right", ctrlRow);
  el("span", "yt-cc-badge", ctrlRight, "CC");
  el("span", "yt-hd-badge", ctrlRight, "1080p HD");
  el("span", "yt-theater-ico", ctrlRight, "▭");
  el("span", "yt-full-ico", ctrlRight, "⛶");

  // Thông tin video & hàng nút YouTube dưới khung phát
  const info = el("div", "yt-info", main);
  el("div", "yt-video-title", info, y.videoTitle);
  const metaRow = el("div", "yt-meta-row", info);
  const chAvatar = el("div", "yt-ch-avatar", metaRow, "GP");
  chAvatar.style.background = "#ff0000";
  const chText = el("div", "yt-ch-text", metaRow);
  const chNameRow = el("div", "yt-ch-name-row", chText);
  el("span", "yt-ch-name", chNameRow, y.channel);
  el("span", "yt-ch-verified", chNameRow, "✓");
  el("div", "yt-ch-sub", chText, y.subscribers);
  el("div", "yt-sub-btn", metaRow, y.subscribeLabel);

  const actions = el("div", "yt-actions", metaRow);
  el("div", "yt-action-pill", actions, "👍 4,8 N  |  👎");
  el("div", "yt-action-pill", actions, "↗ Chia sẻ");
  el("div", "yt-action-pill", actions, "⬇ Tải xuống");

  // Cột phải: bộ lọc + danh sách video đề xuất của YouTube
  const side = el("div", "yt-side", body);
  const chips = el("div", "yt-chips", side);
  el("span", "yt-chip active", chips, "Tất cả");
  el("span", "yt-chip", chips, "Hội thảo");
  el("span", "yt-chip", chips, "Trực tiếp");

  y.upNext.forEach((item, idx) => {
    const card = el("div", "yt-next-card", side);
    const thumb = el("div", "yt-next-thumb", card);
    const thumbImg = el("img", "yt-next-img", thumb);
    thumbImg.alt = "";
    thumbImg.src = assets.still(THUMBS[idx % THUMBS.length]);
    el("span", "yt-next-dur", thumb, DURATIONS[idx] ?? "12:00");
    const txt = el("div", "yt-next-txt", card);
    el("div", "yt-next-name", txt, item.title);
    el("div", "yt-next-ch", txt, `${item.channel} ✓`);
    el("div", "yt-next-meta", txt, item.meta);
  });

  return {
    async render(t) {
      const [ytFrom, ytTo] = tl.scenes.youtube;
      if (t < tl.scenes.slide1[0] || t >= tl.scenes.slide2[1]) return;
      const playStart = Math.min(ytFrom, tl.youtube.voiceStartMs);
      playIco.textContent = "❚❚";
      const span = Math.max(1, ytTo - playStart);
      const p = Math.max(0, Math.min(1, (t - playStart) / span));
      const pct = 24 + p * 46;
      progFill.style.width = `${pct.toFixed(2)}%`;
      progBuf.style.width = `${Math.min(100, pct + 14).toFixed(2)}%`;
      progDot.style.left = `${pct.toFixed(2)}%`;

      const elapsedSec = 252 + Math.max(0, Math.floor((t - playStart) / 1000));
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
      const ss = String(elapsedSec % 60).padStart(2, "0");
      timeText.textContent = `${mm}:${ss} / 12:45`;

      const rms = ytVoice ? levelAt(ytVoice, tl.youtube.voiceStartMs, t) : 0;
      const g = Math.min(1, rms / 0.06);
      videoWrap.style.boxShadow = `0 0 0 ${2 + 6 * g}px rgba(239, 68, 68, ${0.25 + 0.5 * g})`;

      const weights = [0.6, 1, 0.8, 0.95, 0.65];
      waveBars.forEach((b, k) => {
        b.style.height = `${4 + Math.round(12 * g * weights[k])}px`;
      });

      const activeIdx = p < 0.34 ? 0 : p < 0.66 ? 1 : 2;
      pointNodes.forEach((node, idx) => {
        node.classList.toggle("active", idx <= activeIdx);
      });

      const frameIdx = Math.max(0, Math.floor((t - tl.scenes.slide1[0]) / FRAME_MS + 1e-6));
      try {
        const src = assets.frame("yt-speaker", frameIdx);
        if (videoFeed.getAttribute("src") !== src) {
          videoFeed.src = src;
          await videoFeed.decode().catch(() => {});
        }
      } catch {
        // Fallback nếu chưa tách khung yt-speaker
      }
    },
  };
}
