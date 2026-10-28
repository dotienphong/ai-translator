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

  // Menu thả xuống (điều hướng, ngôn ngữ): đóng khi bấm ra ngoài hoặc nhấn Esc
  const menus = [...document.querySelectorAll(".nav details, .lang-menu")];
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

  // Khối tab "Tính năng chính" ở trang chủ (spec 2026-10-27-trang-chu-ba-viec-tab): tab đầu mở sẵn; neo # mở đúng tab; mũi tên,
  // Home, End đổi tab; chuyển tab thì tạm dừng video của panel vừa rời. Tắt JS: thanh tab ẩn, ba panel hiện nối nhau.
  document.querySelectorAll("[data-ftabs]").forEach((root) => {
    const list = root.querySelector('[role="tablist"]');
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
    if (!list || tabs.length === 0 || panels.some((p) => !p)) return;
    const hashId = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return ""; } };
    const byHash = () => tabs.find((t) => t.getAttribute("aria-controls") === hashId());
    // Neo #id trỏ vào panel còn thanh tab nằm trên nó: đặt --ftabs-lift (CSS dùng làm scroll-margin-top của panel) bằng khoảng từ đỉnh thanh tab
    // tới đỉnh panel, để cả chỗ trình duyệt tự cuộn tới cũng dừng với thanh tab dưới header. offsetTop không tính transform của hiệu ứng vào.
    const setLift = () => {
      const open = panels.find((p) => !p.hidden);
      if (open) root.style.setProperty("--ftabs-lift", `${open.offsetTop - list.offsetTop}px`);
    };
    const select = (tab, { focus = false, hash = false, user = false } = {}) => {
      if (user && tab.getAttribute("aria-selected") !== "true") root.classList.add("is-switched"); // hiệu ứng vào chỉ khi người dùng đổi tab
      root.classList.add("is-enhanced");
      list.hidden = false;
      tabs.forEach((t, i) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        if (!on) panels[i].querySelectorAll("video").forEach((v) => v.pause());
        panels[i].hidden = !on;
      });
      setLift();
      if (focus) tab.focus();
      if (hash) history.replaceState(null, "", "#" + tab.getAttribute("aria-controls"));
    };
    // Cuộn tới đỉnh khối tab (thanh tab dưới header nhờ scroll-padding-top của html). Lúc đổi neo, panel đích còn ẩn nên trình duyệt không tự cuộn
    // tới. Lúc tải trang, trình duyệt tự cuộn theo neo (mượt) và có thể làm vậy trước khi --ftabs-lift được đặt (panel đầu hiện sẵn): cuộn lại
    // tức thì, một lần ngay và một lần khi trang tải xong; hai cách cuộn dừng cùng một chỗ nên không giằng co.
    const toRoot = (behavior) => requestAnimationFrame(() => root.scrollIntoView({ block: "start", behavior }));
    const first = byHash();
    select(first ?? tabs[0]);
    if (first) {
      toRoot("instant");
      if (document.readyState !== "complete") window.addEventListener("load", () => toRoot("instant"), { once: true });
    }
    if (typeof ResizeObserver === "function") new ResizeObserver(setLift).observe(list);
    tabs.forEach((t) => t.addEventListener("click", () => select(t, { hash: true, user: true })));
    list.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: (i + 1) % tabs.length, ArrowDown: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, ArrowUp: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[next], { focus: true, hash: true, user: true });
    });
    window.addEventListener("hashchange", () => { const t = byHash(); if (t) { select(t, { user: true }); toRoot(); } });
  });

  // Video demo (spec 2026-10-22-website-ja-zh-ko §4): nút phát lớn giữa khung thay thanh điều khiển gốc cho tới khi bấm. Trên máy
  // tính (chuột, rộng từ 900 px, không giảm chuyển động), lần đầu hơn nửa khung vào màn hình thì nút đập nhịp mời xem, một lần.
  document.querySelectorAll("[data-video]").forEach((fig) => {
    const video = fig.querySelector("video");
    const btn = fig.querySelector(".video-play");
    if (!video || !btn) return;
    video.controls = false;
    btn.hidden = false;
    fig.classList.add("is-facade");
    btn.addEventListener("click", () => {
      fig.classList.remove("is-facade", "is-inviting");
      btn.hidden = true;
      video.controls = true;
      video.focus({ preventScroll: true });
      // Phát lỗi (mạng, trình duyệt chặn): thanh điều khiển gốc đã hiện, người xem bấm lại ở đó.
      video.play()?.catch(() => {});
    });
    const desktop = matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)").matches;
    if (!desktop || matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    fig.classList.add("can-invite");
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      fig.classList.add("is-inviting");
      io.disconnect();
    }, { threshold: 0.5 });
    io.observe(fig);
  });

  // Chat hỗ trợ (spec chat hỗ trợ 2026-10-22, mục 3): bong bóng góc dưới phải ở mọi trang (tắt JS thì không có; trang Liên hệ
  // vẫn có email). Đường dẫn đã băm của chat nằm ở thuộc tính data-chat-* của thẻ script này (layout.mjs). Khung chat (chat.js,
  // chat.css) chỉ tải khi bấm. Lõi (chat-core.js) chỉ tải khi khách đang chờ trả lời: hỏi tin mới lúc tải trang rồi mỗi 60 giây
  // khi tab đang hiện; có trả lời thì bong bóng hiện chấm đỏ.
  const chatCfg = document.querySelector("script[data-chat-core]")?.dataset;
  if (chatCfg) {
    const wrap = document.createElement("div");
    wrap.className = "chat-root";
    wrap.innerHTML = '<button class="chat-bubble" type="button" aria-expanded="false" aria-controls="chat-panel"><span class="chat-bubble-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="chat-dot" hidden></span></button>';
    document.body.appendChild(wrap);
    const bubble = wrap.firstElementChild;
    const dot = bubble.querySelector(".chat-dot");
    const markUnread = (on) => {
      dot.hidden = !on;
      bubble.setAttribute("aria-label", on ? `${chatCfg.chatLabel} (${chatCfg.chatUnread})` : chatCfg.chatLabel);
    };
    markUnread(false);
    let ui = null;
    let loading = null;
    let watcher = null;
    // Cùng điều kiện với isWaiting của chat-core.js, đọc thẳng ở đây để khỏi tải lõi khi không chờ: có token, tin cuối là của
    // khách, gửi trong 24 giờ qua.
    const waiting = () => {
      let s = null;
      try { s = JSON.parse(store.get("support.v1")); } catch { /* bản lưu hỏng */ }
      return Boolean(s && typeof s.token === "string" && Number.isInteger(s.waitingSince) && Date.now() / 1000 - s.waitingSince < 86400);
    };
    const watch = (immediate) => {
      watcher?.stop();
      watcher = null;
      if (!waiting()) return;
      import(chatCfg.chatCore)
        .then((core) => { if (!ui?.isOpen()) watcher = core.watchReply({ immediate, onReply: () => markUnread(true) }); })
        .catch(() => { /* tải lỗi (mạng): lần tải trang sau thử lại */ });
    };
    const loadCss = (href) => new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
    const open = async () => {
      if (!loading) loading = Promise.all([loadCss(chatCfg.chatCss), import(chatCfg.chatUi)]).then(([, mod]) => (ui = mod));
      try { await loading; } catch { loading = null; return; } // tải lỗi (mạng): bấm lại để thử
      watcher?.stop();
      watcher = null;
      markUnread(false);
      ui.openChat({ root: wrap, bubble, lang: chatCfg.chatLang, onClose: () => watch(false) });
    };
    bubble.addEventListener("click", () => (ui?.isOpen() ? ui.closeChat() : open()));
    watch(true);
  }

  // Google Analytics 4 (chính sách quyền riêng tư 1.9, mục 14): chỉ tải sau khi khách bấm Đồng ý. Từ chối hay chưa chọn thì không
  // có kết nối nào tới Google và không có cookie. Chữ và mã đo lường nằm ở thuộc tính data-consent của thẻ script (layout.mjs,
  // src/consent.mjs). Lựa chọn lưu ở localStorage của khách; đổi ý bằng nút "Cài đặt cookie" ở chân trang.
  const consent = (() => { try { return JSON.parse(document.querySelector("script[data-consent]")?.dataset.consent ?? "null"); } catch { return null; } })();
  if (consent) {
    const KEY = "ga-consent";
    let gaLoaded = false;
    const wipeCookies = () => {
      const names = document.cookie.split(";").map((c) => c.split("=")[0].trim()).filter((n) => n === "_ga" || n.startsWith("_ga_") || n === "_gid" || n.startsWith("_gat"));
      const labels = location.hostname.split(".");
      const domains = [""];
      for (let i = 0; i < labels.length - 1; i++) domains.push(`; domain=${i ? "." : ""}${labels.slice(i).join(".")}`);
      for (const n of names) for (const d of domains) document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
    };
    const setGa = (on) => {
      window[`ga-disable-${consent.id}`] = !on;
      if (!on) { wipeCookies(); return; }
      if (gaLoaded) return;
      gaLoaded = true;
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      window.gtag("config", consent.id, { allow_google_signals: false, allow_ad_personalization_signals: false });
      const tag = document.createElement("script");
      tag.async = true;
      tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(consent.id)}`;
      document.head.appendChild(tag);
    };
    let bar = null;
    const hideBar = () => { bar?.remove(); bar = null; };
    const choose = (granted) => { store.set(KEY, granted ? "granted" : "denied"); setGa(granted); hideBar(); };
    const showBar = () => {
      if (bar) return;
      bar = document.createElement("div");
      bar.className = "consent-bar";
      bar.setAttribute("role", "region");
      bar.setAttribute("aria-label", consent.label);
      const text = document.createElement("p");
      text.textContent = `${consent.text} `;
      const link = document.createElement("a");
      link.href = consent.href;
      link.textContent = consent.policy;
      text.appendChild(link);
      const actions = document.createElement("div");
      actions.className = "consent-actions";
      for (const [granted, label, cls] of [[false, consent.decline, "btn btn-secondary"], [true, consent.accept, "btn btn-primary"]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = label;
        b.addEventListener("click", () => choose(granted));
        actions.appendChild(b);
      }
      bar.append(text, actions);
      document.body.appendChild(bar);
    };
    const saved = store.get(KEY);
    if (saved === "granted") setGa(true);
    else if (saved !== "denied") showBar();
    document.querySelectorAll("[data-consent-open]").forEach((b) => {
      b.hidden = false;
      b.addEventListener("click", showBar);
    });
  }

  // Hiện dần khi cuộn tới
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  }
})();
