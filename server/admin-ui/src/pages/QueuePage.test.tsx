import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueuePage } from "./QueuePage";

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}
const empty = { count: 0, items: [] };
const summary = { revenue_today: 550000, currency: "VND", paid_orders_7d: 12, active_licenses: 87 };

afterEach(() => {
  vi.unstubAllGlobals();
});

function serve(queue: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => json(url === "/admin/summary" ? summary : queue)),
  );
}

describe("QueuePage", () => {
  it("ba ô số và báo không có việc khi mọi nhóm rỗng", async () => {
    serve({ needs_review: empty, underpaid: empty, email_failed: empty, locked: empty, conflict: empty, alerts: empty });
    render(<QueuePage />);
    expect(await screen.findByText("550.000 đ")).toBeTruthy();
    expect(screen.getByText("87")).toBeTruthy();
    expect(await screen.findByText("Không có việc gì cần xử lý.")).toBeTruthy();
  });

  it("nhóm có việc thì hiện tiêu đề, số lượng, link tới đơn; nhóm rỗng thì ẩn", async () => {
    const order = { order_code: 1000012, email: "khach@example.com", amount: 500000, amount_paid: 500000, created_at: 1_790_812_800 };
    serve({ needs_review: { count: 21, items: [order] }, underpaid: empty, email_failed: empty, locked: empty, conflict: empty, alerts: empty });
    render(<QueuePage />);
    expect(await screen.findByText("Đã nhận tiền nhưng license đã thu hồi")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Đơn #1000012" }).getAttribute("href")).toBe("/orders/1000012");
    expect(screen.getByText("và 20 mục khác")).toBeTruthy();
    expect(screen.queryByText("Chuyển thiếu trong 30 ngày")).toBeNull();
  });
});
