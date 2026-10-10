// Biểu tượng nét của cửa sổ chính (vẽ riêng cho app, lưới 24×24, nét theo màu chữ). Chỉ để trang trí: luôn `aria-hidden`,
// chữ bên cạnh mới là nhãn.
const PATHS = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z",
  transcript: "M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V4a.5.5 0 0 1 0-.5ZM14 3.5V8h4M9.5 12h5M9.5 15.5h5",
  history: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9M12 8v4.5l3 1.8",
  glossary: "M5 4.5h11.5a1 1 0 0 1 1 1V18H6.5A1.5 1.5 0 0 0 5 19.5ZM5 19.5A1.5 1.5 0 0 0 6.5 21h11V18M9 8.5h5M9 11.5h3.5",
  settings:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2 1.2l-.3 2h-4l-.3-2a7 7 0 0 1-2-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L3 9.3l2-3.4 1.9.7a7 7 0 0 1 2-1.2l.3-2h4l.3 2a7 7 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3Z",
  upgrade: "M12 3.5 14.4 9l5.6.5-4.3 3.7 1.3 5.6L12 15.8l-5 3 1.3-5.6L4 9.5 9.6 9Z",
  about: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 11v5.5M12 7.6v.1",
  play: "M8 5.5v13l10.5-6.5Z",
  stop: "M7 7h10v10H7Z",
  x: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  check: "M5 12.5l4.5 4.5L19 7.5",
  search: "M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM15.5 15.5 20 20",
  copy: "M9 9h10.5v11.5H9ZM6 15H4.5V3.5H16V5",
  download: "M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15",
  upload: "M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 19.5h15",
  trash: "M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5",
  edit: "M4.5 19.5 5 16 15.5 5.5a2.1 2.1 0 0 1 3 3L8 19ZM13.5 7.5l3 3",
  alert: "M12 4 21 19.5H3ZM12 10v4.5M12 17v.1",
  info: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 11v5.5M12 7.6v.1",
  refresh: "M19.5 12a7.5 7.5 0 0 1-13.3 4.8M4.5 12A7.5 7.5 0 0 1 17.8 7.2M18 3.5v4h-4M6 20.5v-4h4",
  external: "M13.5 4.5h6v6M19.5 4.5 11 13M17 14v5.5H4.5V7H10",
  globe: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5Z",
  speaker: "M4.5 9.5h3.5L13 5v14l-5-4.5H4.5ZM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11",
  captions: "M3.5 6.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1ZM7 14.5h5M14.5 14.5H17M7 11h2.5M12 11h5",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z",
  eyeOff: "M4 4l16 16M10 6.1A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 7.8A16 16 0 0 0 2.5 12S6 18.5 12 18.5a8.6 8.6 0 0 0 4-1M10 10.2a2.8 2.8 0 0 0 3.8 3.8",
  lock: "M6 11h12v9.5H6ZM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  unlock: "M6 11h12v9.5H6ZM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2",
  keyboard: "M3.5 6.5h17v11h-17ZM7 10h.1M10 10h.1M13 10h.1M16 10h.1M8 14h8",
  key: "M8.5 15.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12.3 10.5h8.2v3M17.5 10.5v2.5",
  shield: "M12 3.5 19 6v5.5c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6Z",
  cpu: "M7 7h10v10H7ZM10 10h4v4h-4ZM9.5 4v3M14.5 4v3M9.5 17v3M14.5 17v3M4 9.5h3M4 14.5h3M17 9.5h3M17 14.5h3",
  chevronRight: "M9.5 6l6 6-6 6",
  chevronLeft: "M14.5 6l-6 6 6 6",
  arrowRight: "M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5",
  mic: "M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3ZM6 11.5a6 6 0 0 0 12 0M12 17.5v3",
  file: "M7 3.5h7l4 4v13H7ZM14 3.5V8h4",
  sparkle: "M12 3.5c.6 4.4 2.6 6.9 7 7.5-4.4.6-6.4 3.1-7 7.5-.6-4.4-2.6-6.9-7-7.5 4.4-.6 6.4-3.1 7-7.5Z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
