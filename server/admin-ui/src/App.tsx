// Khung trang (spec Web Admin §4.1; giao diện mới 2026-10-08 mục 2): thanh bên (thu gọn được, ngăn kéo trên điện thoại),
// thanh trên có ô tra cứu, vùng nội dung theo route. Đổi trang: đóng ngăn kéo, cuộn lên đầu, focus vào nội dung và đọc tên
// trang cho trình đọc màn hình.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { SESSION_EXPIRED_EVENT } from "./api/client";
import { api } from "./api/endpoints";
import type { Queue } from "./api/types";
import { IconWarning } from "./components/icons";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { useLoad } from "./hooks";
import { AuditPage } from "./pages/AuditPage";
import { DevicePage } from "./pages/DevicePage";
import { LicensePage } from "./pages/LicensePage";
import { LicensesPage } from "./pages/LicensesPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OrderPage } from "./pages/OrderPage";
import { OrdersPage } from "./pages/OrdersPage";
import { QueuePage } from "./pages/QueuePage";
import { SearchPage } from "./pages/SearchPage";
import { SystemPage } from "./pages/SystemPage";
import { ToolsPage } from "./pages/ToolsPage";
import { TrialsPage } from "./pages/TrialsPage";
import { matchRoute, type Route, usePath } from "./router";

// Trang Tổng quan kéo theo Recharts: nạp lười để các trang hỗ trợ khách không nặng thêm (spec Tổng quan, mục 4).
const OverviewPage = lazy(() => import("./pages/OverviewPage").then((m) => ({ default: m.OverviewPage })));

/** Lựa chọn thu gọn thanh bên, nhớ giữa các lần mở (localStorage có thể bị chặn: bỏ qua êm). */
export const COLLAPSED_KEY = "admin.sidebar.collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
  } catch {
    // Trình duyệt chặn lưu trữ: lựa chọn chỉ giữ tới khi tải lại trang.
  }
}

/** Tên trang: tiêu đề tab và câu thông báo đổi trang cho trình đọc màn hình. */
export function routeTitle(route: Route): string {
  switch (route.name) {
    case "queue":
      return "Việc cần xử lý";
    case "overview":
      return "Tổng quan";
    case "system":
      return "Hệ thống";
    case "search":
      return "Kết quả tra cứu";
    case "orders":
      return "Đơn hàng";
    case "order":
      return `Đơn #${route.param ?? ""}`;
    case "licenses":
      return "License";
    case "license":
      return "Chi tiết license";
    case "device":
      return "Chi tiết máy";
    case "trials":
      return "Máy & dùng thử";
    case "audit":
      return "Nhật ký";
    case "tools":
      return "Công cụ";
    default:
      return "Không có trang này";
  }
}

const queueTotal = (q: Queue) => q.needs_review.count + q.underpaid.count + q.email_failed.count + q.locked.count + q.conflict.count + q.alerts.count;

function Page({ route }: { route: Route }) {
  const p = route.param ?? "";
  switch (route.name) {
    case "queue":
      return <QueuePage />;
    case "overview":
      return (
        <Suspense fallback={<p className="muted">Đang tải…</p>}>
          <OverviewPage />
        </Suspense>
      );
    case "system":
      return <SystemPage />;
    case "search":
      return <SearchPage />;
    case "orders":
      return <OrdersPage />;
    case "order":
      return <OrderPage key={p} code={Number(p)} />;
    case "licenses":
      return <LicensesPage />;
    case "license":
      return <LicensePage key={p} id={p} />;
    case "device":
      return <DevicePage key={p} hash={p} />;
    case "trials":
      return <TrialsPage />;
    case "audit":
      return <AuditPage />;
    case "tools":
      return <ToolsPage />;
    default:
      return <NotFoundPage />;
  }
}

export function App() {
  const path = usePath();
  const route = matchRoute(path);
  const title = routeTitle(route);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [expired, setExpired] = useState(false);
  const [announce, setAnnounce] = useState("");
  const me = useLoad(() => api.whoami(), []);
  // Số việc cần xử lý cho huy hiệu ở thanh bên: tải một lần khi mở App; lỗi thì không hiện gì (trang Việc cần xử lý tự báo lỗi).
  const queue = useLoad(() => api.queue(), []);
  const mainRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  /** Nơi nhận focus khi ngăn kéo vừa đóng (phải đợi phần còn lại hết inert mới focus được). */
  const focusAfterClose = useRef<"menu" | "main" | null>(null);
  const prevPath = useRef(path);

  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  useEffect(() => {
    document.title = `${title} · AI Translator Admin`;
  }, [title]);

  // Đổi trang (không tính lần vẽ đầu): đóng ngăn kéo, cuộn lên đầu, focus vào nội dung, đọc tên trang.
  useEffect(() => {
    if (prevPath.current === path) return;
    prevPath.current = path;
    document.documentElement.scrollTop = 0;
    setAnnounce(`Đã mở trang ${title}`);
    if (menuOpen) {
      focusAfterClose.current = "main";
      setMenuOpen(false);
    } else {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [path, title, menuOpen]);

  // Ngăn kéo mở: khóa cuộn nền. Vừa đóng: đưa focus về nút menu (Esc, lớp phủ, nút Đóng) hay vào nội dung (đổi trang).
  useEffect(() => {
    const root = document.documentElement;
    if (menuOpen) {
      root.classList.add("drawer-open");
      return () => root.classList.remove("drawer-open");
    }
    const target = focusAfterClose.current;
    focusAfterClose.current = null;
    if (target === "menu") menuBtnRef.current?.focus();
    else if (target === "main") mainRef.current?.focus({ preventScroll: true });
    return undefined;
  }, [menuOpen]);

  // Màn hình rộng ra quá khổ điện thoại khi ngăn kéo đang mở (xoay máy, kéo cửa sổ): đóng ngăn kéo.
  useEffect(() => {
    if (!menuOpen || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 801px)");
    const onChange = () => {
      if (mq.matches) setMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [menuOpen]);

  const closeMenu = useCallback(() => {
    focusAfterClose.current = "menu";
    setMenuOpen(false);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      writeCollapsed(!c);
      return !c;
    });
  }, []);

  return (
    <div className={`app${collapsed ? " is-collapsed" : ""}`}>
      <a
        href="#noi-dung"
        className="skip-link"
        onClick={(e) => {
          // Không thêm #noi-dung vào địa chỉ: chỉ đưa focus vào nội dung.
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Bỏ qua tới nội dung
      </a>
      <Sidebar
        current={route.name}
        queueCount={queue.data ? queueTotal(queue.data) : null}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        open={menuOpen}
        onClose={closeMenu}
      />
      <div className={`scrim${menuOpen ? " open" : ""}`} aria-hidden="true" onClick={closeMenu} />
      {/* inert khi ngăn kéo mở: Tab và trình đọc màn hình chỉ đi trong ngăn kéo. */}
      <div className="app-body" inert={menuOpen}>
        <Topbar
          operator={me.data?.operator ?? null}
          operatorLoading={me.loading}
          menuOpen={menuOpen}
          onMenu={() => setMenuOpen(true)}
          menuButtonRef={menuBtnRef}
        />
        {expired && (
          <div className="banner-wrap">
            <div className="banner" role="alert">
              <IconWarning size={20} />
              <div className="banner-text">
                <strong>Phiên đăng nhập hết hạn.</strong>
                <span>Tải lại trang để đăng nhập lại; thao tác chưa gửi sẽ không được lưu.</span>
              </div>
              <button type="button" className="primary small" onClick={() => window.location.reload()}>
                Tải lại trang
              </button>
            </div>
          </div>
        )}
        <main id="noi-dung" className="main" tabIndex={-1} ref={mainRef}>
          <div className="content" key={path}>
            <Page route={route} />
          </div>
        </main>
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </div>
  );
}
