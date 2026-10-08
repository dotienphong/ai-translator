// Thanh bên (spec giao diện mới, mục 2): thương hiệu, ba nhóm có nhãn, biểu tượng, số việc cần xử lý; thu gọn thành thanh
// biểu tượng trên máy tính; trên điện thoại là ngăn kéo (App lo lớp phủ, khóa cuộn và trả focus; ở đây lo Esc và bẫy focus).
import { type ComponentType, type KeyboardEvent, useEffect, useId, useRef } from "react";
import { Link, type RouteName } from "../router";
import {
  BrandMark,
  IconChart,
  IconCart,
  IconClose,
  IconInbox,
  IconKey,
  IconLog,
  IconMonitor,
  type IconProps,
  IconServer,
  IconSidebarCollapse,
  IconSidebarExpand,
  IconTool,
} from "./icons";

interface NavEntry {
  to: string;
  label: string;
  icon: ComponentType<IconProps>;
  routes: RouteName[];
  /** Mục Việc cần xử lý: hiện số việc. */
  counted?: boolean;
}

export const NAV_GROUPS: { label: string; items: NavEntry[] }[] = [
  {
    label: "Vận hành",
    items: [
      { to: "/", label: "Việc cần xử lý", icon: IconInbox, routes: ["queue"], counted: true },
      { to: "/overview", label: "Tổng quan", icon: IconChart, routes: ["overview"] },
    ],
  },
  {
    label: "Dữ liệu",
    items: [
      { to: "/orders", label: "Đơn hàng", icon: IconCart, routes: ["orders", "order"] },
      { to: "/licenses", label: "License", icon: IconKey, routes: ["licenses", "license"] },
      { to: "/trials", label: "Máy & dùng thử", icon: IconMonitor, routes: ["trials", "device"] },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { to: "/audit", label: "Nhật ký", icon: IconLog, routes: ["audit"] },
      { to: "/system", label: "Hệ thống", icon: IconServer, routes: ["system"] },
      { to: "/tools", label: "Công cụ", icon: IconTool, routes: ["tools"] },
    ],
  },
];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface SidebarProps {
  current: RouteName;
  /** Tổng số việc cần xử lý; null khi chưa tải hay tải lỗi (không hiện gì). */
  queueCount: number | null;
  collapsed: boolean;
  onToggleCollapsed(): void;
  /** Ngăn kéo điện thoại đang mở. */
  open: boolean;
  /** Đóng ngăn kéo (Esc, nút Đóng): App trả focus về nút menu. */
  onClose(): void;
}

export function Sidebar({ current, queueCount, collapsed, onToggleCollapsed, open, onClose }: SidebarProps) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const groupId = useId();

  // Mở ngăn kéo: đưa focus vào nút Đóng (phần tử đầu tiên), Esc đóng.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Bẫy focus: Tab ở phần tử cuối quay về đầu và ngược lại, chỉ khi ngăn kéo đang mở.
  function trapFocus(e: KeyboardEvent<HTMLElement>) {
    if (!open || e.key !== "Tab" || !ref.current) return;
    // Nút thu gọn ở chân thanh bên bị ẩn trên điện thoại: không tính.
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest(".sidebar-foot"));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const count = queueCount !== null && queueCount > 0 ? queueCount : null;

  return (
    <aside
      ref={ref}
      id="thanh-ben"
      className={`sidebar${open ? " open" : ""}`}
      // Ngăn kéo điện thoại là hộp thoại: trình đọc màn hình chỉ đọc bên trong; trên máy tính là vùng bình thường.
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
      aria-label={open ? "Menu" : undefined}
      onKeyDown={trapFocus}
    >
      <div className="sidebar-head">
        <Link to="/" className="brand">
          <BrandMark />
          <span className="brand-text">
            AI Translator <span className="brand-tag">Admin</span>
          </span>
        </Link>
        <button ref={closeRef} type="button" className="icon-btn sidebar-close" aria-label="Đóng menu" onClick={onClose}>
          <IconClose size={20} />
        </button>
      </div>

      <nav className="nav-scroll" aria-label="Điều hướng">
        {NAV_GROUPS.map((g, gi) => (
          <div key={g.label} className="nav-group">
            <p className="nav-group-label" id={`${groupId}-${gi}`}>
              {g.label}
            </p>
            <ul className="nav-list" aria-labelledby={`${groupId}-${gi}`}>
              {g.items.map((n) => {
                const active = n.routes.includes(current);
                const Icon = n.icon;
                const showCount = n.counted && count !== null;
                return (
                  <li key={n.to} className="nav-item">
                    <Link to={n.to} className={`nav-link${active ? " active" : ""}`} current={active}>
                      <Icon />
                      <span className="nav-label">{n.label}</span>
                      {showCount && (
                        <>
                          <span className="nav-count" aria-hidden="true">
                            {count > 99 ? "99+" : count}
                          </span>
                          <span className="sr-only">{`, ${count} việc`}</span>
                        </>
                      )}
                    </Link>
                    {/* Tên mục khi thanh bên thu gọn: chỉ để nhìn, tên đọc được đã nằm trong link. */}
                    <span className="nav-tip" aria-hidden="true">
                      {showCount ? `${n.label} (${count})` : n.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button type="button" className="ghost collapse-btn" aria-controls="thanh-ben" onClick={onToggleCollapsed}>
          {collapsed ? <IconSidebarExpand /> : <IconSidebarCollapse />}
          <span className="collapse-label">{collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}</span>
        </button>
        <span className="nav-tip" aria-hidden="true">
          Mở rộng thanh bên
        </span>
      </div>
    </aside>
  );
}
