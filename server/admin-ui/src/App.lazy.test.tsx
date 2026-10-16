import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

// Trang Tổng quan nạp lười (chunk riêng). Sau khi Worker admin cập nhật, chunk cũ có thể không còn: import() bị từ chối. Mô phỏng
// bằng mô-đun giả ném lỗi khi nạp (n4 của rà B4): khung lỗi thay chỗ nội dung, thanh bên còn nguyên, không trắng cả App.
vi.mock("./pages/OverviewPage", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

const empty = { count: 0, items: [] };
const responses: Record<string, unknown> = {
  "/admin/whoami": { operator: "ops@example.com" },
  "/admin/queue": { needs_review: empty, underpaid: empty, email_failed: empty, locked: empty, conflict: empty, alerts: empty },
  "/admin/summary": { revenue_today: { VND: 0, USD: 0 }, paid_orders_7d: 0, active_licenses: 0 },
};

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = responses[url.split("?")[0] ?? ""];
      return new Response(JSON.stringify(body ?? { error: "not_found" }), { status: body ? 200 : 404, headers: { "content-type": "application/json" } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App: chunk tải lười không nạp được", () => {
  it("mở Tổng quan mà chunk lỗi: khung lỗi có Tải lại trang trong vùng nội dung, thanh bên và thanh trên vẫn dùng được", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    await user.click(screen.getByRole("link", { name: "Tổng quan" }));
    const box = await screen.findByText("Trang lỗi khi hiển thị");
    expect(box.closest("[role=alert]")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tải lại trang" })).toBeTruthy();
    expect(screen.getByText("ops@example.com")).toBeTruthy();
    const nav = within(screen.getByRole("navigation", { name: "Điều hướng" }));
    await user.click(nav.getByRole("link", { name: "Việc cần xử lý" }));
    expect(await screen.findByRole("heading", { name: "Việc cần xử lý" })).toBeTruthy();
    expect(screen.queryByText("Trang lỗi khi hiển thị")).toBeNull();
  });
});
