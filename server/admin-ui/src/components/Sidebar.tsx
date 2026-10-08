import { Link, type RouteName } from "../router";

const NAV: { to: string; label: string; routes: RouteName[] }[] = [
  { to: "/", label: "Việc cần xử lý", routes: ["queue"] },
  { to: "/overview", label: "Tổng quan", routes: ["overview"] },
  { to: "/orders", label: "Đơn hàng", routes: ["orders", "order"] },
  { to: "/licenses", label: "License", routes: ["licenses", "license"] },
  { to: "/trials", label: "Máy & dùng thử", routes: ["trials", "device"] },
  { to: "/audit", label: "Nhật ký", routes: ["audit"] },
  { to: "/tools", label: "Công cụ", routes: ["tools"] },
];

export function Sidebar({ current, open }: { current: RouteName; open: boolean }) {
  return (
    <nav className={`sidebar${open ? " open" : ""}`} aria-label="Điều hướng">
      {NAV.map((n) => (
        <Link key={n.to} to={n.to} className={`nav-item${n.routes.includes(current) ? " active" : ""}`}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
