// Nâng cấp dần dần: trang vẫn đầy đủ khi tắt JS (menu dùng <details>, FAQ dùng <details>, hoạt họa là CSS).
(() => {
  const root = document.documentElement;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* chế độ riêng tư */ } },
  };
  const isDark = () => root.dataset.theme === "dark" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);

  // Nút đổi sáng/tối
  const toggle = document.querySelector("[data-theme-toggle]");
  const paint = () => {
    if (!toggle) return;
    const use = toggle.querySelector("use");
    if (use) use.setAttribute("href", isDark() ? "#i-sun" : "#i-moon");
    toggle.setAttribute("aria-pressed", String(isDark()));
  };
  paint();
  toggle?.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    store.set("theme", next);
    paint();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", paint);

  // Menu thả xuống: đóng khi bấm ra ngoài hoặc nhấn Esc
  const menus = [...document.querySelectorAll(".nav details")];
  document.addEventListener("click", (e) => menus.forEach((d) => { if (!d.contains(e.target)) d.open = false; }));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    menus.forEach((d) => { if (d.open) { d.open = false; d.querySelector("summary")?.focus(); } });
    const m = document.querySelector(".mnav[open]");
    if (m) { m.open = false; m.querySelector("summary")?.focus(); }
  });
  menus.forEach((d) => d.addEventListener("toggle", () => { if (d.open) menus.forEach((o) => { if (o !== d) o.open = false; }); }));
  document.querySelectorAll(".mobile-nav a").forEach((a) => a.addEventListener("click", () => { const m = a.closest(".mnav"); if (m) m.open = false; }));
  matchMedia("(min-width: 980px)").addEventListener?.("change", (e) => { if (e.matches) document.querySelector(".mnav")?.removeAttribute("open"); });

  // Chép vào clipboard: API hiện đại, có đường lui cho trình duyệt cũ hay ngữ cảnh không an toàn
  const copyText = async (text) => {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* thử đường lui */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.className = "sr-only";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch { return false; }
  };
  // Nút bấm có nhãn đổi tạm sau khi chép: gắn cho nút Sao chép của khối lệnh và nút Sao chép liên kết
  const wireCopy = (btn, getText) => {
    const label = btn.querySelector("span");
    let timer = 0;
    btn.addEventListener("click", async () => {
      if (!(await copyText(getText()))) return;
      label.textContent = btn.dataset.copied;
      btn.classList.add("is-copied");
      clearTimeout(timer);
      timer = setTimeout(() => { label.textContent = btn.dataset.label; btn.classList.remove("is-copied"); }, 2500);
    });
  };
  document.querySelectorAll(".cmd-copy").forEach((btn) => { btn.hidden = false; wireCopy(btn, () => btn.dataset.copy); });

  // Tab hệ điều hành ở trang Tải xuống: nhận diện máy của người dùng và mở đúng hướng dẫn
  const detectOS = () => {
    const ua = navigator.userAgent || "";
    const plat = navigator.userAgentData?.platform || navigator.platform || "";
    const touch = (navigator.maxTouchPoints || 0) > 1;
    if (/iPhone|iPad|iPod/.test(ua) || (/Mac/i.test(plat) && touch)) return { os: "ios", mobile: true };
    if (/Android/i.test(ua)) return { os: "android", mobile: true };
    if (/Win/i.test(plat) || /Windows/.test(ua)) return { os: "windows" };
    if (/Mac/i.test(plat) || /Macintosh|Mac OS X/.test(ua)) return { os: "macos" };
    if (/CrOS/.test(ua)) return { os: "other" };
    if (/Linux|X11|BSD/i.test(plat + ua)) return { os: "other" };
    return { os: "other" };
  };
  document.querySelectorAll("[data-ostabs]").forEach((root) => {
    const list = root.querySelector('[role="tablist"]');
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
    if (!list || tabs.length === 0 || panels.some((p) => !p)) return;
    const detectChip = document.getElementById("os-detect");
    const keyOf = (t) => t.dataset.os;
    const KEY = "dl-os";
    const detected = detectOS();
    const mine = tabs.find((t) => keyOf(t) === detected.os);

    const select = (tab, { focus = false, remember = false, hash = true } = {}) => {
      if (!root.classList.contains("is-enhanced")) { root.classList.add("is-enhanced"); list.hidden = false; }
      tabs.forEach((t, i) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
      });
      if (focus) tab.focus();
      if (remember) { try { sessionStorage.setItem(KEY, keyOf(tab)); } catch { /* chế độ riêng tư */ } }
      if (hash) history.replaceState(null, "", "#" + tab.getAttribute("aria-controls"));
    };
    const byHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      return tabs.find((t) => t.getAttribute("aria-controls") === id);
    };

    // Điện thoại, máy tính bảng, hệ điều hành chưa hỗ trợ: không có "tab đúng", nên hiện cả hai hướng dẫn nối nhau (người đọc
    // và trình thu thập đều thấy đủ), chỉ thêm lời nhắn. Neo # vẫn mở đúng một tab.
    const showAll = !mine && !byHash();
    const note = root.querySelector("[data-note]");
    const noteText = root.querySelector("[data-note-text]");
    const copyLink = root.querySelector("[data-copy-link]");
    if (showAll) root.classList.add("is-flat");
    else {
      root.classList.add("is-enhanced");
      list.hidden = false;
      if (mine) mine.querySelector(".ostab-badge").hidden = false;
    }

    // Ưu tiên: neo # trên URL > lựa chọn tay trước đó (cùng phiên) > hệ điều hành nhận diện > tab đầu tiên
    let saved = null;
    try { saved = sessionStorage.getItem(KEY); } catch { /* chế độ riêng tư */ }
    if (!showAll) {
      const first = byHash() || tabs.find((t) => keyOf(t) === saved) || mine || tabs[0];
      select(first, { hash: Boolean(byHash()) });
      if (byHash()) requestAnimationFrame(() => root.scrollIntoView({ block: "start" }));
    }

    tabs.forEach((t) => t.addEventListener("click", () => select(t, { remember: true })));
    list.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: (i + 1) % tabs.length, ArrowDown: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, ArrowUp: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[next], { focus: true, remember: true });
    });
    window.addEventListener("hashchange", () => { const t = byHash(); if (t) select(t, { hash: false }); });

    // Lời nhắn theo thiết bị: nhận ra hệ điều hành, hay máy chưa được hỗ trợ
    const say = (text, withCopy) => {
      noteText.textContent = text;
      copyLink.hidden = !withCopy;
      note.hidden = false;
    };
    if (detected.mobile) say(root.dataset.msgMobile, true);
    else if (!mine) say(root.dataset.msgOther, false);
    else if (detectChip) {
      detectChip.textContent = root.dataset.msgDetected.replace("{os}", mine.querySelector("strong").textContent);
      detectChip.hidden = false;
    }
    if (copyLink) wireCopy(copyLink, () => location.origin + location.pathname);
  });

  // Hiện dần khi cuộn tới
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  }
})();
