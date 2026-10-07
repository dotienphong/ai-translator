// Ô tra cứu (spec Web Admin §4.3) và kho từ khóa. Từ khóa chỉ giữ trong bộ nhớ, không đưa lên URL hay history.state
// (spec §4.2), để email không lọt vào lịch sử trình duyệt.
import { useSyncExternalStore } from "react";
import type { LookupQuery } from "./api/endpoints";
import type { LookupResult } from "./api/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CROCKFORD_28 = /^[0-9A-HJKMNP-TV-Z]{28}$/;

/** Nhận dạng chuỗi ở ô tra cứu theo thứ tự của spec §4.3. null: không nhận ra. */
export function detectQuery(raw: string): LookupQuery | null {
  const s = raw.trim();
  if (s === "") return null;
  if (s.includes("@")) return { email: s };
  if (/^\d{1,15}$/.test(s)) return { order_code: Number(s) };
  if (UUID.test(s)) return { license_id: s.toLowerCase() };
  if (/^[0-9a-f]{64}$/i.test(s)) return { device_id_hash: s.toLowerCase() };
  // Như normalizeLicenseKey của server: bỏ khoảng trắng và gạch nối, viết hoa, O→0, I và L→1. Server kiểm ký tự kiểm tra.
  const key = s.replace(/[\s-]/g, "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
  if (CROCKFORD_28.test(key)) return { license_key: s };
  return null;
}

/** Kết quả chỉ có một license và mọi đơn đều thuộc license đó: mở thẳng trang license. */
export function singleTarget(r: LookupResult): string | null {
  const lic = r.licenses.length === 1 ? r.licenses[0] : undefined;
  if (lic && r.orders.every((o) => o.license_id === lic.id || o.renew_license_id === lic.id)) return `/licenses/${lic.id}`;
  return null;
}

export interface SearchState {
  query: LookupQuery;
  /** Tăng mỗi lần tìm, để tìm lại cùng từ khóa cũng tải lại. */
  seq: number;
}

let current: SearchState | null = null;
const listeners = new Set<() => void>();

export function setSearch(query: LookupQuery): void {
  current = { query, seq: (current?.seq ?? 0) + 1 };
  for (const l of listeners) l();
}

export function currentSearch(): SearchState | null {
  return current;
}

/** Chỉ cho test. */
export function resetSearch(): void {
  current = null;
}

export function useSearch(): SearchState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
  );
}
