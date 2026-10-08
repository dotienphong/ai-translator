import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fmtVnd } from "../format";
import { ChartCard, ChartTooltip } from "./ChartCard";

// Recharts thật cần kích thước và ResizeObserver mà jsdom không có: thay bằng khung thử ghi lại các thuộc tính ChartCard truyền xuống.
// Chất lượng vẽ thật do công cụ scripts/csp-check.mjs (Chrome headless) kiểm.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children?: unknown }) => <div data-testid="container">{children as never}</div>,
  BarChart: ({ children, data }: { children?: unknown; data: unknown[] }) => (
    <div data-testid="bar-chart" data-rows={data.length}>
      {children as never}
    </div>
  ),
  Bar: (p: { dataKey: string; name: string; stackId?: string; fill: string }) => (
    <i data-testid="bar" data-key={p.dataKey} data-name={p.name} data-stack={p.stackId ?? ""} data-fill={p.fill} />
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: (p: { allowDecimals?: boolean }) => <i data-testid="yaxis" data-decimals={String(p.allowDecimals)} />,
  // Tooltip: ghi thứ tự mà bộ sắp xếp của ChartCard cho ba mục thử có dataKey "c", "a", "b".
  Tooltip: (p: { itemSorter?: (item: { dataKey: string }) => unknown }) => (
    <i data-testid="tooltip" data-order={["c", "a", "b"].map((k) => String(p.itemSorter?.({ dataKey: k }))).join(",")} />
  ),
}));

// Chú giải là danh sách HTML ngoài Recharts (giao diện mới: vùng vẽ của các thẻ đặt cạnh nhau cao bằng nhau), nên test đọc
// thẳng danh sách "Chú giải" thay cho thành phần Legend của Recharts như trước.
const legend = () => screen.queryByRole("list", { name: "Chú giải" });
const legendItems = () => [...(legend()?.querySelectorAll("li") ?? [])].map((li) => li.textContent);

const ONE = [{ key: "revenue", label: "Doanh thu" }];
const ROWS = [
  { label: "01/10", revenue: 50000 },
  { label: "02/10", revenue: 0 },
  { label: "03/10", revenue: 1500000 },
];

describe("ChartCard", () => {
  it("tiêu đề, một cột mỗi chuỗi, không chồng, không chú giải khi chỉ có một chuỗi", () => {
    render(<ChartCard title="Doanh thu 30 ngày" data={ROWS} series={ONE} format={fmtVnd} />);
    expect(screen.getByRole("heading", { name: "Doanh thu 30 ngày" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Doanh thu 30 ngày" })).toBeTruthy();
    expect(screen.getByTestId("bar-chart").getAttribute("data-rows")).toBe("3");
    const bars = screen.getAllByTestId("bar");
    expect(bars).toHaveLength(1);
    expect(bars[0]?.getAttribute("data-key")).toBe("revenue");
    expect(bars[0]?.getAttribute("data-name")).toBe("Doanh thu");
    expect(bars[0]?.getAttribute("data-stack")).toBe("");
    expect(legend()).toBeNull();
  });

  it("nhiều chuỗi: có chú giải, màu theo thứ tự biến CSS; stacked thì cùng stackId", () => {
    const series = [
      { key: "monthly", label: "Monthly" },
      { key: "yearly", label: "Yearly" },
    ];
    render(<ChartCard title="Theo gói" stacked data={[{ label: "10/2026", monthly: 1, yearly: 2 }]} series={series} />);
    const bars = screen.getAllByTestId("bar");
    expect(bars.map((b) => b.getAttribute("data-fill"))).toEqual(["var(--chart-1)", "var(--chart-2)"]);
    expect(new Set(bars.map((b) => b.getAttribute("data-stack")))).toEqual(new Set(["chong"]));
    expect(legendItems()).toEqual(["Monthly", "Yearly"]);
  });

  it("nhiều chuỗi mà một chuỗi toàn 0 (Yearly chưa có đơn): vẫn vẽ biểu đồ, không báo chưa có dữ liệu", () => {
    const series = [
      { key: "monthly", label: "Monthly" },
      { key: "yearly", label: "Yearly" },
    ];
    render(<ChartCard title="Theo gói" stacked data={[{ label: "09/2026", monthly: 50000, yearly: 0 }, { label: "10/2026", monthly: 100000, yearly: 0 }]} series={series} />);
    expect(screen.queryByText("Chưa có dữ liệu trong khoảng này")).toBeNull();
    expect(screen.getByTestId("bar-chart")).toBeTruthy();
    expect(screen.getAllByTestId("bar")).toHaveLength(2);
  });

  it("trục dọc: mặc định cho số lẻ; integer thì không (biểu đồ đếm không có vạch 0,5)", () => {
    const { unmount } = render(<ChartCard title="Tiền" data={ROWS} series={ONE} />);
    expect(screen.getByTestId("yaxis").getAttribute("data-decimals")).toBe("true");
    unmount();
    render(<ChartCard title="Đếm" integer data={[{ label: "x", revenue: 1 }]} series={ONE} />);
    expect(screen.getByTestId("yaxis").getAttribute("data-decimals")).toBe("false");
  });

  it("chú giải và tooltip giữ thứ tự chuỗi của trang, không tự xếp theo tên", () => {
    const series = [
      { key: "c", label: "Cuối" },
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ];
    render(<ChartCard title="Thứ tự" data={[{ label: "x", a: 1, b: 2, c: 3 }]} series={series} />);
    expect(legendItems()).toEqual(["Cuối", "A", "B"]);
    expect(screen.getByTestId("tooltip").getAttribute("data-order")).toBe("0,1,2");
  });

  it("không stacked thì các chuỗi không có stackId", () => {
    const series = [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ];
    render(<ChartCard title="Hai cột" data={[{ label: "x", a: 1, b: 2 }]} series={series} />);
    expect(screen.getAllByTestId("bar").map((b) => b.getAttribute("data-stack"))).toEqual(["", ""]);
  });

  it("bảng số: đủ dòng, đúng tiêu đề cột, số định dạng bằng format; giá trị thiếu thành 0", () => {
    const { container } = render(
      <ChartCard title="T" labelHeader="Ngày" data={[...ROWS, { label: "04/10" }]} series={ONE} format={fmtVnd} />,
    );
    expect(screen.getByText("Xem bảng số")).toBeTruthy();
    const headers = [...container.querySelectorAll("thead th")].map((h) => h.textContent);
    expect(headers).toEqual(["Ngày", "Doanh thu"]);
    const rows = [...container.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(rows).toEqual([
      ["01/10", "50.000 đ"],
      ["02/10", "0 đ"],
      ["03/10", "1.500.000 đ"],
      ["04/10", "0 đ"],
    ]);
  });

  it("mọi giá trị bằng 0: báo chưa có dữ liệu, không vẽ biểu đồ, không có bảng", () => {
    const { container } = render(<ChartCard title="Rỗng" data={[{ label: "01/10", revenue: 0 }]} series={ONE} />);
    expect(screen.getByText("Chưa có dữ liệu trong khoảng này")).toBeTruthy();
    expect(screen.queryByTestId("bar-chart")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });

  it("mô tả và đơn vị: hiện dưới tiêu đề và ở góc vùng vẽ", () => {
    render(<ChartCard title="Doanh thu" description="Theo ngày, giờ Việt Nam" unit="Đơn vị: đồng" data={ROWS} series={ONE} />);
    expect(screen.getByText("Theo ngày, giờ Việt Nam")).toBeTruthy();
    expect(screen.getByText("Đơn vị: đồng")).toBeTruthy();
  });

  it("thẻ là một vùng có tên là tiêu đề", () => {
    render(<ChartCard title="Doanh thu 30 ngày" data={ROWS} series={ONE} />);
    expect(screen.getByRole("region", { name: "Doanh thu 30 ngày" })).toBeTruthy();
  });

  it("màu chuỗi cố định theo thứ tự, không xoay vòng: ô màu của chú giải khớp cột", () => {
    const series = ["a", "b", "c", "d"].map((k) => ({ key: k, label: k.toUpperCase() }));
    const { container } = render(<ChartCard title="Bốn" data={[{ label: "x", a: 1, b: 1, c: 1, d: 1 }]} series={series} />);
    expect(screen.getAllByTestId("bar").map((b) => b.getAttribute("data-fill"))).toEqual(["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"]);
    expect([...container.querySelectorAll(".chart-legend .chart-swatch")].map((e) => e.className)).toEqual([
      "chart-swatch s-0",
      "chart-swatch s-1",
      "chart-swatch s-2",
      "chart-swatch s-3",
    ]);
  });
});

describe("ChartTooltip", () => {
  const series = [
    { key: "monthly", label: "Monthly" },
    { key: "yearly", label: "Yearly" },
  ];
  const payload = [
    { dataKey: "monthly", name: "Monthly", value: 450000 },
    { dataKey: "yearly", name: "Yearly", value: 1000000 },
  ];

  it("không hoạt động hay không có dữ liệu: không vẽ gì", () => {
    const { container } = render(<ChartTooltip active={false} payload={payload} label="x" series={series} format={fmtVnd} stacked />);
    expect(container.innerHTML).toBe("");
  });

  it("tên mốc, mỗi chuỗi một dòng với giá trị đã định dạng, dòng Tổng khi cột chồng", () => {
    const { container } = render(<ChartTooltip active payload={payload} label="10/2026" series={series} format={fmtVnd} stacked />);
    expect(screen.getByText("10/2026")).toBeTruthy();
    const rows = [...container.querySelectorAll("li")].map((li) => li.textContent);
    expect(rows).toEqual(["Monthly450.000 đ", "Yearly1.000.000 đ"]);
    expect(container.querySelector(".chart-tooltip-total")?.textContent).toBe("Tổng1.450.000 đ");
  });

  it("không chồng: không có dòng Tổng", () => {
    const { container } = render(<ChartTooltip active payload={payload} label="x" series={series} format={fmtVnd} stacked={false} />);
    expect(container.querySelector(".chart-tooltip-total")).toBeNull();
  });
});
