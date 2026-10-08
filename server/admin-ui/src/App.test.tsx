import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

// Recharts thật không chạy trong jsdom; trang Tổng quan chỉ cần ChartCard giả để kiểm khung.
vi.mock("./components/ChartCard", () => ({ ChartCard: ({ title }: { title: string }) => <div>{title}</div> }));

const empty = { count: 0, items: [] };
const responses: Record<string, unknown> = {
  "/admin/whoami": { operator: "ops@example.com" },
  "/admin/queue": { needs_review: empty, underpaid: empty, email_failed: empty, locked: empty, conflict: empty, alerts: empty },
  "/admin/summary": { revenue_today: 0, currency: "VND", paid_orders_7d: 0, active_licenses: 0 },
  "/admin/orders": { items: [], next_cursor: null },
  "/admin/alerts": { items: [], total: 0, pending: 0 },
  "/admin/releases": { base_url: "https://releases.example.com", channels: { stable: { status: "missing" }, beta: { status: "missing" } }, models: { status: "missing" } },
};

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = responses[url.split("?")[0] ?? ""];
      return new Response(JSON.stringify(body ?? { error: "not_found" }), {
        status: body ? 200 : 404,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("mở đầu ở Việc cần xử lý, hiện email người vận hành; bấm thanh bên thì đổi trang", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Việc cần xử lý" })).toBeTruthy();
    expect(await screen.findByText("ops@example.com")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Đơn hàng" }));
    expect(window.location.pathname).toBe("/orders");
    expect(await screen.findByRole("heading", { name: "Đơn hàng" })).toBeTruthy();
  });

  it("mục Tổng quan bấm được: đổi sang /overview, nạp trang tải lười và đánh dấu mục đang chọn", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    const link = screen.getByRole("link", { name: "Tổng quan" });
    expect(link.getAttribute("href")).toBe("/overview");
    expect(screen.queryByText("sắp có")).toBeNull();
    await user.click(link);
    expect(window.location.pathname).toBe("/overview");
    expect(await screen.findByRole("heading", { name: "Tổng quan" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tổng quan" }).className).toContain("active");
  });

  it("mục Hệ thống nằm ngay sau Tổng quan; bấm thì đổi sang /system và hiện trang", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    const nav = within(screen.getByRole("navigation", { name: "Điều hướng" }));
    expect(nav.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Việc cần xử lý",
      "Tổng quan",
      "Hệ thống",
      "Đơn hàng",
      "License",
      "Máy & dùng thử",
      "Nhật ký",
      "Công cụ",
    ]);
    const link = nav.getByRole("link", { name: "Hệ thống" });
    expect(link.getAttribute("href")).toBe("/system");
    await user.click(link);
    expect(window.location.pathname).toBe("/system");
    expect(await screen.findByRole("heading", { name: "Hệ thống" })).toBeTruthy();
    expect(nav.getByRole("link", { name: "Hệ thống" }).className).toContain("active");
  });

  it("phiên Access hết hạn: hiện thanh báo có nút tải lại", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ type: "opaqueredirect", status: 0, ok: false, headers: new Headers() }) as Response));
    render(<App />);
    expect(await screen.findByRole("button", { name: "Tải lại trang" })).toBeTruthy();
  });
});
