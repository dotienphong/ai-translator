import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Stats } from "../api/types";
import { OverviewPage } from "./OverviewPage";

// Recharts thật không chạy trong jsdom: ChartCard giả ghi lại dữ liệu và cấu hình mà trang truyền xuống.
vi.mock("../components/ChartCard", () => ({
  ChartCard: (p: { title: string; data: { label: string }[]; series: { key: string; label: string }[]; stacked?: boolean; integer?: boolean }) => (
    <div
      data-testid="chart"
      data-title={p.title}
      data-rows={p.data.length}
      data-first={p.data[0]?.label}
      data-stacked={String(p.stacked === true)}
      data-integer={String(p.integer === true)}
      data-series={p.series.map((s) => s.label).join("|")}
      data-keys={p.series.map((s) => s.key).join("|")}
      data-json={JSON.stringify(p.data)}
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
      monthly: MONTHS.map((month) => ({ month, monthly: { revenue: 50000, orders: 7 }, yearly: { revenue: 0, orders: 3 } })),
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
      // Bốn loại khác số nhau để tráo hay lấy nhầm loại thì lộ ra.
      grants_monthly: MONTHS.map((month) => ({ month, new: 1, extend: 2, change: 3, other: 4 })),
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

// Đổi chủ ý: ô số cũ (.tile) thành thành phần Stat (.stat) có biểu tượng và tông.
const tile = (label: string) => screen.getByText(label).closest(".stat") as HTMLElement;
/** Dòng chỉ số (Cần chú ý, Máy): nhãn và giá trị nằm trong cùng một dòng .metric. */
const metric = (label: string) => {
  const el = screen.getByText(label).closest(".metric") as HTMLElement;
  return { value: el.querySelector(".metric-value")?.textContent, text: el.textContent ?? "", el };
};

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
    expect(within(tile("Máy đang kích hoạt")).getByText("2 máy có hoạt động trong 7 ngày")).toBeTruthy();
    expect(tile("Doanh thu hôm nay").className).toContain("tone-brand");
    expect(tile("License đang hoạt động").className).toContain("tone-ok");
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

  /** Biểu đồ giả theo tiêu đề: dữ liệu và khóa chuỗi mà trang truyền cho ChartCard. */
  const chartOf = async (title: string) => {
    const el = (await screen.findAllByTestId("chart")).find((c) => c.getAttribute("data-title") === title) as HTMLElement;
    return {
      data: JSON.parse(el.getAttribute("data-json") ?? "[]") as Record<string, string | number>[],
      keys: (el.getAttribute("data-keys") ?? "").split("|"),
      integer: el.getAttribute("data-integer"),
    };
  };

  it("biểu đồ doanh thu 30 ngày: nhãn dd/MM và doanh thu của từng ngày (không phải số đơn)", async () => {
    serve();
    render(<OverviewPage />);
    const c = await chartOf("Doanh thu 30 ngày gần nhất");
    expect(c.keys).toEqual(["revenue"]);
    expect(c.data).toEqual(DAYS.map((d, i) => ({ label: `${d.slice(8)}/${d.slice(5, 7)}`, revenue: i * 1000 })));
    expect(c.data[0]).toEqual({ label: "02/09", revenue: 0 });
    expect(c.data[29]).toEqual({ label: "01/10", revenue: 29000 });
  });

  it("biểu đồ theo gói: Monthly và Yearly lấy đúng doanh thu của gói (không tráo, không lấy số đơn)", async () => {
    serve();
    render(<OverviewPage />);
    const c = await chartOf("Doanh thu 12 tháng, theo gói");
    expect(c.keys).toEqual(["monthly", "yearly"]);
    expect(c.data).toHaveLength(12);
    expect(c.data[0]).toEqual({ label: "11/2025", monthly: 50000, yearly: 0 });
    expect(c.data.every((r) => r.monthly === 50000 && r.yearly === 0)).toBe(true);
  });

  it("biểu đồ mua mới, gia hạn, đổi gói: đủ bốn khóa, mỗi loại đúng số của mình", async () => {
    serve();
    render(<OverviewPage />);
    const c = await chartOf("Mua mới, gia hạn, đổi gói theo tháng");
    expect(c.keys).toEqual(["new", "extend", "change", "other"]);
    expect(c.integer).toBe("true");
    expect(c.data).toHaveLength(12);
    expect(c.data[0]).toEqual({ label: "11/2025", new: 1, extend: 2, change: 3, other: 4 });
    expect(c.data.every((r) => r.new === 1 && r.extend === 2 && r.change === 3 && r.other === 4)).toBe(true);
  });

  it("biểu đồ máy dùng thử mới: khóa count và số của từng ngày; trục đếm số nguyên", async () => {
    serve();
    render(<OverviewPage />);
    const c = await chartOf("Máy dùng thử mới mỗi ngày");
    expect(c.keys).toEqual(["count"]);
    expect(c.integer).toBe("true");
    expect(c.data).toEqual(DAYS.map((d, i) => ({ label: `${d.slice(8)}/${d.slice(5, 7)}`, count: i % 3 })));
    expect(c.data.some((r) => r.count !== 0)).toBe(true);
  });

  it("mọi biểu đồ: mỗi khóa chuỗi có trong dữ liệu của chính biểu đồ đó (gõ sai khóa ở một phía thì lộ ra)", async () => {
    serve();
    render(<OverviewPage />);
    const charts = await screen.findAllByTestId("chart");
    expect(charts).toHaveLength(4);
    for (const el of charts) {
      const rows = JSON.parse(el.getAttribute("data-json") ?? "[]") as Record<string, unknown>[];
      const keys = (el.getAttribute("data-keys") ?? "").split("|");
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(["label", ...keys].sort());
    }
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
    // Phần nhìn (ẩn với trình đọc màn hình): không có máy thì "—" và câu báo rõ, không có thanh đầy.
    const vis = screen.getByText("30 ngày gần nhất").closest(".ov-ratio-vis") as HTMLElement;
    expect(vis.getAttribute("aria-hidden")).toBe("true");
    expect(within(vis).getByText("—")).toBeTruthy();
    expect(within(vis).getByText("Chưa có máy dùng thử")).toBeTruthy();
    expect(vis.querySelector(".ratio-fill")).toBeNull();
  });

  it("phễu dùng thử, phần nhìn: tỷ lệ lớn và thanh có bề rộng theo tỷ lệ (thuộc tính SVG, không style inline)", async () => {
    serve();
    render(<OverviewPage />);
    const vis = (await screen.findByText("Từ trước đến nay")).closest(".ov-ratio-vis") as HTMLElement;
    expect(within(vis).getByText("33%")).toBeTruthy();
    expect(vis.querySelector(".ratio-fill")?.getAttribute("width")).toBe("33%");
    expect(document.querySelector("[style]")).toBeNull();
  });

  it("bảng mua mới, gia hạn, đổi gói trong 30 ngày: số đơn và doanh thu từng loại", async () => {
    serve();
    render(<OverviewPage />);
    const row = async (kind: string) => (await screen.findByRole("cell", { name: kind })).closest("tr")?.textContent ?? "";
    expect(await row("Mua mới")).toBe("Mua mới2100.000 đ");
    expect(await row("Gia hạn")).toBe("Gia hạn150.000 đ");
    expect(await row("Đổi gói")).toBe("Đổi gói1500.000 đ");
    expect(await row("Khác")).toBe("Khác00 đ");
    expect(await row("Tổng")).toBe("Tổng4650.000 đ");
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

  it("trạng thái cần xem: paid_needs_review lớn hơn 0 là liên kết; refunded lớn hơn 0 thì không", async () => {
    const st = makeStats();
    st.health.orders_30d = { ...st.health.orders_30d, paid_needs_review: 3, refunded: 4, underpaid: 0, failed: 0 };
    serve(st);
    render(<OverviewPage />);
    const list = (await screen.findByText("Đơn 30 ngày theo trạng thái")).closest("section") as HTMLElement;
    expect(within(list).getByRole("link", { name: /Cần xử lý/ }).getAttribute("href")).toBe("/orders?status=paid_needs_review");
    expect(within(list).getAllByRole("link")).toHaveLength(1);
    expect(within(list).queryByRole("link", { name: /Đã hoàn tiền/ })).toBeNull();
    expect(within(list).getByText("Đã hoàn tiền").closest("li")?.textContent).toBe("Đã hoàn tiền4");
  });

  // Đổi chủ ý: câu "Nhãn: số" thành dòng chỉ số (nhãn, gợi ý, số lớn căn phải) có tông.
  it("sức khỏe: license sắp hết hạn và tỷ lệ gửi key; không có đơn có email thì báo rõ", async () => {
    serve();
    const { unmount } = render(<OverviewPage />);
    await screen.findByText("Sắp hết hạn trong 7 ngày");
    expect(metric("Sắp hết hạn trong 7 ngày").value).toBe("1");
    expect(metric("Sắp hết hạn trong 7 ngày").el.className).toContain("tone-warn");
    expect(metric("Sắp hết hạn trong 30 ngày").value).toBe("3");
    const mail = metric("Email key đã gửi");
    // Có dấu cách quanh "/": số hàng nghìn ("94.000 / 96.000") xuống dòng ở đó thay vì giữa số (pha 6)
    expect(mail.value).toBe("1 / 2");
    expect(mail.text).toContain("50% số đơn đã trả có email");
    expect(mail.el.className).toContain("tone-warn"); // chưa gửi hết
    unmount();
    const none = makeStats();
    none.health.email = { paid_with_email_30d: 0, sent: 0 };
    none.health.expiring_7d = 0;
    serve(none);
    render(<OverviewPage />);
    expect(await screen.findByText("Chưa có đơn nào có email trong 30 ngày")).toBeTruthy();
    expect(metric("Email key đã gửi").value).toBe("—");
    expect(metric("Sắp hết hạn trong 7 ngày").el.className).not.toContain("tone-warn");
  });

  it("sử dụng: máy hoạt động 7 ngày và dùng thử còn hạn", async () => {
    serve();
    render(<OverviewPage />);
    await screen.findByText("Hoạt động trong 7 ngày gần nhất");
    expect(metric("Hoạt động trong 7 ngày gần nhất").value).toBe("2");
    expect(metric("Dùng thử còn hạn").value).toBe("1");
    expect(metric("Đang kích hoạt").value).toBe("3");
  });

  it("giờ cập nhật theo GMT+7; đang tải thì khung chờ (aria-busy); Làm mới gọi lại API", async () => {
    const fetchMock = serve();
    const { container } = render(<OverviewPage />);
    // Đổi chủ ý: chữ "Đang tải…" chỉ còn cho trình đọc màn hình; nhìn thấy là khung chờ cùng bố cục.
    expect(screen.getByText("Đang tải số liệu…")).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"] .stat.is-skeleton')).toBeTruthy();
    expect(await screen.findByText("Cập nhật lúc 07:00")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/admin/stats");
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  // Đổi chủ ý: nút đang tải giữ focus (thành phần Button: aria-busy, vòng quay, bỏ qua lần bấm) thay vì disabled.
  it("đang tải lại thì nút Làm mới ở trạng thái đang xử lý và bấm chồng không gọi thêm, tải xong thì mở lại", async () => {
    let n = 0;
    let finish: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => (n++ === 0 ? Promise.resolve(json(makeStats())) : new Promise<Response>((r) => (finish = r))));
    vi.stubGlobal("fetch", fetchMock);
    render(<OverviewPage />);
    const button = (await screen.findByRole("button", { name: "Làm mới" })) as HTMLButtonElement;
    await screen.findByText("Doanh thu hôm nay");
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBeNull());
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Số liệu cũ vẫn hiện trong lúc tải lại (không nháy khung chờ).
    expect(screen.getByText("Doanh thu hôm nay")).toBeTruthy();
    finish(json(makeStats()));
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBeNull());
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
