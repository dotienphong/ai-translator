// Khung trang (spec Web Admin §4.1, bố cục A): thanh trên có ô tra cứu, thanh bên trái, nội dung theo route.
import { lazy, Suspense, useEffect, useState } from "react";
import { SESSION_EXPIRED_EVENT } from "./api/client";
import { api } from "./api/endpoints";
import { SearchBox } from "./components/SearchBox";
import { Sidebar } from "./components/Sidebar";
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
import { Link, matchRoute, type Route, usePath } from "./router";

// Trang Tổng quan kéo theo Recharts: nạp lười để các trang hỗ trợ khách không nặng thêm (spec Tổng quan, mục 4).
const OverviewPage = lazy(() => import("./pages/OverviewPage").then((m) => ({ default: m.OverviewPage })));

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [expired, setExpired] = useState(false);
  const me = useLoad(() => api.whoami(), []);

  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);
  useEffect(() => setMenuOpen(false), [path]);

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="menu-btn" aria-label="Mở menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          ☰
        </button>
        <Link to="/" className="brand">
          AI Translator Admin
        </Link>
        <SearchBox />
        <span className="operator">{me.data?.operator ?? ""}</span>
      </header>
      {expired && (
        <div className="banner" role="alert">
          <span>Phiên đăng nhập hết hạn.</span>
          <button type="button" onClick={() => window.location.reload()}>
            Tải lại trang
          </button>
        </div>
      )}
      <div className="layout">
        <Sidebar current={route.name} open={menuOpen} />
        <main className="main">
          <Page route={route} />
        </main>
      </div>
    </div>
  );
}
