import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const empty = { count: 0, items: [] };
const responses: Record<string, unknown> = {
  "/admin/whoami": { operator: "ops@example.com" },
  "/admin/queue": { needs_review: empty, underpaid: empty, email_failed: empty, locked: empty, conflict: empty, alerts: empty },
  "/admin/summary": { revenue_today: 0, currency: "VND", paid_orders_7d: 0, active_licenses: 0 },
  "/admin/orders": { items: [], next_cursor: null },
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
    expect(screen.getByText("Tổng quan").closest("[aria-disabled]")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("phiên Access hết hạn: hiện thanh báo có nút tải lại", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ type: "opaqueredirect", status: 0, ok: false, headers: new Headers() }) as Response));
    render(<App />);
    expect(await screen.findByRole("button", { name: "Tải lại trang" })).toBeTruthy();
  });
});
