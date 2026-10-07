import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSearch, setSearch } from "../search";
import { SearchPage } from "./SearchPage";

const NOW = Math.floor(Date.now() / 1000);
const ID_A = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const ID_B = "7c1e0b9e-3a5f-4d1c-8a9e-1f2d4c3b6a96";
const KEY_A = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";
const KEY_B = "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG";

const licenseOf = (id: string, key: string) => ({
  id,
  license_key: key,
  email: "khach@example.com",
  plan: "monthly",
  expires_at: NOW + 20 * 86400,
  created_at: NOW - 86400,
  revoked_at: null,
  locked_at: null,
  conflict: false,
  activations: [],
  audit: [],
});

const orderOf = (code: number, licenseId: string | null) => ({
  order_code: code,
  provider: "payos",
  plan: "monthly",
  amount: 50000,
  amount_paid: 50000,
  currency: "VND",
  email: "khach@example.com",
  status: "paid",
  grant_kind: "new",
  license_id: licenseId,
  renew_license_id: null,
  created_at: NOW - 86400,
  paid_at: NOW - 86000,
  email_sent_at: NOW - 86000,
  email_gave_up_at: null,
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let calls: { url: string; method: string; body: unknown }[];

function serve(result: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      return json(result);
    }),
  );
}

beforeEach(() => {
  calls = [];
  resetSearch();
  window.history.replaceState(null, "", "/search");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetSearch();
  window.history.replaceState(null, "", "/");
});

describe("SearchPage", () => {
  it("chưa có từ khóa: hiện câu hướng dẫn và không gọi API", async () => {
    serve({ licenses: [], orders: [] });
    render(<SearchPage />);
    expect(screen.getByText("Nhập email hay license key vào ô tra cứu ở trên.")).toBeTruthy();
    await act(async () => {});
    expect(calls).toEqual([]);
    expect(window.location.pathname).toBe("/search");
  });

  it("một license duy nhất: chuyển thẳng tới /licenses/:id bằng replaceState, không thêm mục vào lịch sử", async () => {
    serve({ licenses: [licenseOf(ID_A, KEY_A)], orders: [orderOf(1000001, ID_A)] });
    const before = window.history.length;
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    setSearch({ email: "khach@example.com" });
    render(<SearchPage />);
    await waitFor(() => expect(window.location.pathname).toBe(`/licenses/${ID_A}`));
    expect(replace).toHaveBeenCalledWith(null, "", `/licenses/${ID_A}`);
    expect(push).not.toHaveBeenCalled();
    expect(window.history.length).toBe(before);
    expect(calls).toEqual([{ url: "/admin/lookup", method: "POST", body: { email: "khach@example.com" } }]);
  });

  it("nhiều license: hiện bảng license, không chuyển trang", async () => {
    serve({ licenses: [licenseOf(ID_A, KEY_A), licenseOf(ID_B, KEY_B)], orders: [] });
    setSearch({ email: "khach@example.com" });
    render(<SearchPage />);
    expect(await screen.findByRole("heading", { name: "Kết quả tra cứu" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "License" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "K7Q2-…-9XMB" }).getAttribute("href")).toBe(`/licenses/${ID_A}`);
    expect(screen.getByRole("link", { name: "AAAA-…-GGGG" }).getAttribute("href")).toBe(`/licenses/${ID_B}`);
    expect(screen.queryByRole("heading", { name: "Đơn hàng" })).toBeNull();
    expect(window.location.pathname).toBe("/search");
  });

  it("một license nhưng có đơn của license khác: hiện cả hai bảng, không chuyển trang", async () => {
    serve({ licenses: [licenseOf(ID_A, KEY_A)], orders: [orderOf(1000001, ID_A), orderOf(1000002, ID_B)] });
    setSearch({ email: "khach@example.com" });
    render(<SearchPage />);
    expect(await screen.findByRole("heading", { name: "License" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Đơn hàng" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "#1000002" }).getAttribute("href")).toBe("/orders/1000002");
    expect(window.location.pathname).toBe("/search");
  });

  it("chỉ có đơn (chưa có license): hiện bảng đơn, không bảng license, không chuyển trang", async () => {
    serve({ licenses: [], orders: [orderOf(1000003, null)] });
    setSearch({ order_code: 1000003 });
    render(<SearchPage />);
    expect(await screen.findByRole("heading", { name: "Đơn hàng" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "#1000003" }).getAttribute("href")).toBe("/orders/1000003");
    expect(screen.queryByRole("heading", { name: "License" })).toBeNull();
    expect(screen.queryByText("Không tìm thấy gì.")).toBeNull();
    expect(window.location.pathname).toBe("/search");
    expect(calls[0]?.body).toEqual({ order_code: 1000003 });
  });

  it("không có gì: báo không tìm thấy", async () => {
    serve({ licenses: [], orders: [] });
    setSearch({ email: "khong-co@example.com" });
    render(<SearchPage />);
    expect(await screen.findByText("Không tìm thấy gì.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "License" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Đơn hàng" })).toBeNull();
  });
});
