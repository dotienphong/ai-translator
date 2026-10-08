import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Stats } from "../api/types";
import { OverviewPage } from "./OverviewPage";

// Recharts thật không chạy trong jsdom: ChartCard giả ghi lại dữ liệu và cấu hình mà trang truyền xuống.
vi.mock("../components/ChartCard", () => ({
  ChartCard: (p: { title: string; data: { label: string }[]; series: { label: string }[]; stacked?: boolean }) => (
    <div
      data-testid="chart"
      data-title={p.title}
      data-rows={p.data.length}
      data-first={p.data[0]?.label}
      data-stacked={String(p.stacked === true)}
      data-series={p.series.map((s) => s.label).join("|")}
    />
  ),
}));

/** 2026-10-01T00:00:00Z = 07:00 ngày 01/10/2026 GMT+7. */
const T0 = 1_790_812_800;
const pad = (n: number) => String(n).padStart(2, "0");
const DAYS = [...Array.from({ length: 29 }, (_, i) => `2026-09-${pad(i + 2)}`), "2026-10-01"];
const MONTHS = ["2025-11", "2025-12", ...Array.from({ length: 10 }, (_, i) => `2026-${pad(i + 1)}`)];

function makeStats(): Stats {
  return {
    generated_at: T0,
    currency: "VND",
    money: {
      today: 550000,
      last_7d: 650000,
      this_month: 550000,
      last_month: 200000,
      daily: DAYS.map((day, i) => ({ day, revenue: i * 1000, orders: i })),
      monthly: MONTHS.map((month) => ({ month, monthly: { revenue: 50000, orders: 1 }, yearly: { revenue: 0, orders: 0 } })),
    },
    customers: {
      trials_30d: 3,
      trials_30d_purchased: 1,
      trials_total: 6,
      trials_total_purchased: 2,
      grants_30d: {
        new: { orders: 2, revenue: 100000 },
        extend: { orders: 1, revenue: 50000 },
        change: { orders: 1, revenue: 500000 },
        other: { orders: 0, revenue: 0 },
      },
      grants_monthly: MONTHS.map((month) => ({ month, new: 1, extend: 0, change: 0, other: 0 })),
    },
    health: {
      orders_30d: { pending: 2, processing: 0, paid: 3, underpaid: 1, cancelled: 0, expired: 2, failed: 2, paid_needs_review: 0, refunded: 1 },
      expiring_7d: 1,
      expiring_30d: 3,
      email: { paid_with_email_30d: 2, sent: 1 },
    },
    usage: {
      active_licenses: 2,
      active_devices: 3,
      devices_7d: 2,
      trials_active: 1,
      new_trials_daily: DAYS.map((day, i) => ({ day, count: i % 3 })),
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function serve(stats: Stats = makeStats()) {
  const fetchMock = vi.fn(async (_url: string) => json(stats));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const tile = (label: string) => screen.getByText(label).closest(".tile") as HTMLElement;

describe("OverviewPage", () => {
  it("năm ô số: tiền theo VND, tháng trước làm chú thích, license và máy", async () => {
    serve();
    render(<OverviewPage />);
    await screen.findByText("Doanh thu hôm nay");
    expect(within(tile("Doanh thu hôm nay")).getByText("550.000 đ")).toBeTruthy();
    expect(within(tile("Doanh thu 7 ngày")).getByText("650.000 đ")).toBeTruthy();
    expect(within(tile("Doanh thu tháng này")).getByText("550.000 đ")).toBeTruthy();
    expect(within(tile("Doanh thu tháng này")).getByText("Tháng trước: 200.000 đ")).toBeTruthy();
    expect(within(tile("License đang hoạt động")).getByText("2")).toBeTruthy();
    expect(within(tile("Máy đang kích hoạt")).getByText("3")).toBeTruthy();
  });

  it("bốn biểu đồ với đúng dữ liệu, kiểu chồng và chuỗi", async () => {
    serve();
    render(<OverviewPage />);
    const charts = await screen.findAllByTestId("chart");
    const info = charts.map((c) => ({
      title: c.getAttribute("data-title"),
      rows: c.getAttribute("data-rows"),
      first: c.getAttribute("data-first"),
      stacked: c.getAttribute("data-stacked"),
      series: c.getAttribute("data-series"),
    }));
    expect(info).toEqual([
      { title: "Doanh thu 30 ngày gần nhất", rows: "30", first: "02/09", stacked: "false", series: "Doanh thu" },
      { title: "Doanh thu 12 tháng, theo gói", rows: "12", first: "11/2025", stacked: "true", series: "Monthly|Yearly" },
      { title: "Mua mới, gia hạn, đổi gói theo tháng", rows: "12", first: "11/2025", stacked: "true", series: "Mua mới|Gia hạn|Đổi gói|Khác" },
      { title: "Máy dùng thử mới mỗi ngày", rows: "30", first: "02/09", stacked: "false", series: "Máy dùng thử mới" },
    ]);
  });

  it("phễu dùng thử: số máy, số đã mua và tỷ lệ; không chia cho 0", async () => {
    serve();
    const { unmount } = render(<OverviewPage />);
    expect(await screen.findByText("30 ngày gần nhất: 3 máy dùng thử, đã mua 1 (33%)")).toBeTruthy();
    expect(screen.getByText("Từ trước đến nay: 6 máy dùng thử, đã mua 2 (33%)")).toBeTruthy();
    unmount();
    const zero = makeStats();
    zero.customers.trials_30d = 0;
    zero.customers.trials_30d_purchased = 0;
    serve(zero);
    render(<OverviewPage />);
    expect(await screen.findByText("30 ngày gần nhất: 0 máy dùng thử, đã mua 0")).toBeTruthy();
  });

  it("bảng mua mới, gia hạn, đổi gói trong 30 ngày: số đơn và doanh thu từng loại", async () => {
    serve();
    render(<OverviewPage />);
    const row = async (kind: string) => (await screen.findByRole("cell", { name: kind })).closest("tr")?.textContent ?? "";
    expect(await row("Mua mới")).toBe("Mua mới2100.000 đ");
    expect(await row("Gia hạn")).toBe("Gia hạn150.000 đ");
    expect(await row("Đổi gói")).toBe("Đổi gói1500.000 đ");
    expect(await row("Khác")).toBe("Khác00 đ");
  });

  it("đơn theo trạng thái: đủ chín nhãn; trạng thái có vấn đề và lớn hơn 0 là liên kết sang danh sách đã lọc", async () => {
    serve();
    render(<OverviewPage />);
    const list = (await screen.findByText("Đơn 30 ngày theo trạng thái")).closest("section") as HTMLElement;
    expect(within(list).getAllByRole("listitem")).toHaveLength(9);
    expect(within(list).getByRole("link", { name: /Chuyển thiếu/ }).getAttribute("href")).toBe("/orders?status=underpaid");
    expect(within(list).getByRole("link", { name: /Lỗi/ }).getAttribute("href")).toBe("/orders?status=failed");
    expect(within(list).queryByRole("link", { name: /Cần xử lý/ })).toBeNull(); // 0 đơn: không phải liên kết
    expect(within(list).queryByRole("link", { name: /Đã trả/ })).toBeNull(); // trạng thái bình thường: không phải liên kết
    expect(within(list).getByText("Đã trả").closest("li")?.textContent).toBe("Đã trả3");
  });

  it("sức khỏe: license sắp hết hạn và tỷ lệ gửi key; không có đơn có email thì báo rõ", async () => {
    serve();
    const { unmount } = render(<OverviewPage />);
    expect(await screen.findByText("Sắp hết hạn trong 7 ngày: 1")).toBeTruthy();
    expect(screen.getByText("Sắp hết hạn trong 30 ngày: 3")).toBeTruthy();
    expect(screen.getByText("Email key đã gửi: 1/2")).toBeTruthy();
    unmount();
    const none = makeStats();
    none.health.email = { paid_with_email_30d: 0, sent: 0 };
    serve(none);
    render(<OverviewPage />);
    expect(await screen.findByText("Chưa có đơn nào có email trong 30 ngày")).toBeTruthy();
  });

  it("sử dụng: máy hoạt động 7 ngày và dùng thử còn hạn", async () => {
    serve();
    render(<OverviewPage />);
    expect(await screen.findByText("Hoạt động trong 7 ngày gần nhất: 2")).toBeTruthy();
    expect(screen.getByText("Dùng thử còn hạn: 1")).toBeTruthy();
  });

  it("giờ cập nhật theo GMT+7; đang tải thì báo; Làm mới gọi lại API", async () => {
    const fetchMock = serve();
    render(<OverviewPage />);
    expect(screen.getByText("Đang tải…")).toBeTruthy();
    expect(await screen.findByText("Cập nhật lúc 07:00")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/admin/stats");
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("lỗi: hiện thông báo kèm nút Thử lại; thử lại được thì hiện số liệu", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (n++ === 0 ? json({ error: "internal" }, 500) : json(makeStats()))),
    );
    render(<OverviewPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Lỗi máy chủ");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Doanh thu hôm nay")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
