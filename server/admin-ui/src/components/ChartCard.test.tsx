import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fmtVnd } from "../format";
import { ChartCard } from "./ChartCard";

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
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => <i data-testid="legend" />,
}));

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
    expect(screen.queryByTestId("legend")).toBeNull();
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
    expect(screen.getByTestId("legend")).toBeTruthy();
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
});
