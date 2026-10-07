import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fmtDateTime } from "../format";
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

  it("nhóm email: chưa có thời điểm thôi gửi thì nói chưa gửi được sau 24 giờ; có thì ghi giờ thôi gửi", async () => {
    const base = { email: "khach@example.com", amount: 50000, amount_paid: 50000, created_at: 1_790_812_800 };
    const gaveUp = 1_790_900_000;
    serve({
      needs_review: empty,
      underpaid: empty,
      email_failed: {
        count: 2,
        items: [
          { ...base, order_code: 1000020, license_id: "11111111-1111-4111-8111-111111111111", email_gave_up_at: null },
          { ...base, order_code: 1000021, license_id: "22222222-2222-4222-8222-222222222222", email_gave_up_at: gaveUp },
        ],
      },
      locked: empty,
      conflict: empty,
      alerts: empty,
    });
    render(<QueuePage />);
    const row = async (code: number) => (await screen.findByText(`License của đơn #${code}`)).closest("li")?.textContent ?? "";
    const pending = await row(1000020);
    expect(pending).toContain("chưa gửi được sau 24 giờ");
    expect(pending).not.toContain("thôi gửi lúc");
    const gave = await row(1000021);
    expect(gave).toContain(`thôi gửi lúc ${fmtDateTime(gaveUp)}`);
    expect(gave).not.toContain("chưa gửi được sau 24 giờ");
  });
});
