// Router tự viết trên History API (spec Web Admin §4.5): khoảng mười route, không cần thư viện.
import { type MouseEvent, type ReactNode, useSyncExternalStore } from "react";

export type RouteName =
  | "queue"
  | "overview"
  | "search"
  | "orders"
  | "order"
  | "licenses"
  | "license"
  | "device"
  | "trials"
  | "audit"
  | "tools"
  | "not_found";

export interface Route {
  name: RouteName;
  param?: string;
}

/** Mã đơn: số nguyên dương tối đa 15 chữ số (server đòi > 0), cho phép số 0 đứng đầu. */
const ORDER_CODE = "0*[1-9]\\d{0,14}";

const ROUTES: [RouteName, RegExp][] = [
  ["queue", /^\/$/],
  ["overview", /^\/overview$/],
  ["search", /^\/search$/],
  ["orders", /^\/orders$/],
  ["order", new RegExp(`^/orders/(${ORDER_CODE})$`)],
  ["licenses", /^\/licenses$/],
  ["license", /^\/licenses\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/],
  ["device", /^\/devices\/([0-9a-f]{64})$/],
  ["trials", /^\/trials$/],
  ["audit", /^\/audit$/],
  ["tools", /^\/tools$/],
];

export function matchRoute(path: string): Route {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  for (const [name, re] of ROUTES) {
    const m = re.exec(p);
    if (m) return m[1] === undefined ? { name } : { name, param: m[1] };
  }
  return { name: "not_found" };
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  for (const l of listeners) l();
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  }
  return (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
