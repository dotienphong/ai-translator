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

  it("nhóm email: có license_id thì link tới /licenses/:id, không có thì link tới /orders/:code", async () => {
    const LIC = "11111111-1111-4111-8111-111111111111";
    const base = { email: "khach@example.com", amount: 50000, amount_paid: 50000, created_at: 1_790_812_800, email_gave_up_at: null };
    serve({
      needs_review: empty,
      underpaid: empty,
      email_failed: {
        count: 2,
        items: [
          { ...base, order_code: 1000030, license_id: LIC },
          { ...base, order_code: 1000031, license_id: null },
        ],
      },
      locked: empty,
      conflict: empty,
      alerts: empty,
    });
    render(<QueuePage />);
    expect((await screen.findByRole("link", { name: "License của đơn #1000030" })).getAttribute("href")).toBe(`/licenses/${LIC}`);
    expect(screen.getByRole("link", { name: "Đơn #1000031" }).getAttribute("href")).toBe("/orders/1000031");
    expect(screen.queryByRole("link", { name: "Đơn #1000030" })).toBeNull();
    expect(screen.queryByRole("link", { name: "License của đơn #1000031" })).toBeNull();
  });

  it("nhóm chuyển thiếu: link tới /orders/:code", async () => {
    const order = { order_code: 1000040, email: "khach@example.com", amount: 50000, amount_paid: 20000, created_at: 1_790_812_800 };
    serve({ needs_review: empty, underpaid: { count: 1, items: [order] }, email_failed: empty, locked: empty, conflict: empty, alerts: empty });
    render(<QueuePage />);
    expect((await screen.findByRole("link", { name: "Đơn #1000040" })).getAttribute("href")).toBe("/orders/1000040");
  });

  it("nhóm khóa tạm và xung đột máy: link tới /licenses/:id theo từng license", async () => {
    const L1 = "11111111-1111-4111-8111-111111111111";
    const L2 = "22222222-2222-4222-8222-222222222222";
    const lic = (id: string, key: string) => ({
      id,
      license_key: key,
      email: "khach@example.com",
      plan: "monthly",
      expires_at: 1_800_000_000,
      created_at: 1_790_000_000,
      revoked_at: null,
      locked_at: null,
      active_devices: 2,
    });
    serve({
      needs_review: empty,
      underpaid: empty,
      email_failed: empty,
      locked: { count: 1, items: [lic(L1, "K7Q2-…-9XMB")] },
      conflict: { count: 1, items: [lic(L2, "AAAA-…-GGGG")] },
      alerts: empty,
    });
    render(<QueuePage />);
    expect((await screen.findByRole("link", { name: "K7Q2-…-9XMB" })).getAttribute("href")).toBe(`/licenses/${L1}`);
    expect(screen.getByRole("link", { name: "AAAA-…-GGGG" }).getAttribute("href")).toBe(`/licenses/${L2}`);
    expect(screen.getByText("License đang khóa tạm")).toBeTruthy();
    expect(screen.getByText("License đang xung đột máy")).toBeTruthy();
  });

  it("dòng 'và N mục khác' chỉ có khi số lượng lớn hơn số dòng đã hiện, và N là hiệu của hai số đó", async () => {
    const order = (code: number) => ({ order_code: code, email: "khach@example.com", amount: 50000, amount_paid: 20000, created_at: 1_790_812_800 });
    serve({
      needs_review: empty,
      underpaid: { count: 2, items: [order(1000050), order(1000051)] }, // đủ dòng: không có "và … mục khác"
      email_failed: empty,
      locked: empty,
      conflict: empty,
      alerts: { count: 7, items: [{ kind: "cron_stalled", window_start: 1_790_812_800, count: 3, notified_count: 1 }] },
    });
    render(<QueuePage />);
    expect(await screen.findByText("và 6 mục khác")).toBeTruthy();
    expect(screen.getAllByText(/mục khác/)).toHaveLength(1);
    expect(screen.getByText("Đơn #1000051")).toBeTruthy();
  });
});
