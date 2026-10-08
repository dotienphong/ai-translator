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

  // Hiện dần khi cuộn tới
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  }
})();
