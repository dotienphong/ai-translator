import { Link, type RouteName } from "../router";

const NAV: { to: string; label: string; routes: RouteName[] }[] = [
  { to: "/", label: "Việc cần xử lý", routes: ["queue"] },
  { to: "/orders", label: "Đơn hàng", routes: ["orders", "order"] },
  { to: "/licenses", label: "License", routes: ["licenses", "license"] },
  { to: "/trials", label: "Máy & dùng thử", routes: ["trials", "device"] },
  { to: "/audit", label: "Nhật ký", routes: ["audit"] },
  { to: "/tools", label: "Công cụ", routes: ["tools"] },
];

export function Sidebar({ current, open }: { current: RouteName; open: boolean }) {
  const [first, ...rest] = NAV;
  const item = (n: (typeof NAV)[number]) => (
    <Link key={n.to} to={n.to} className={`nav-item${n.routes.includes(current) ? " active" : ""}`}>
      {n.label}
    </Link>
  );
  return (
    <nav className={`sidebar${open ? " open" : ""}`} aria-label="Điều hướng">
      {first && item(first)}
      {/* Phần 2 của lộ trình (spec Web Admin §1). */}
      <span className="nav-item disabled" aria-disabled="true">
        Tổng quan <small>sắp có</small>
      </span>
      {rest.map(item)}
    </nav>
  );
}
