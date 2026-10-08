// Một biểu đồ cột của trang Tổng quan (spec Web Admin phần 2, mục 4 và 5; giao diện mới mục 2). Bọc Recharts: trang không
// biết kiểu của Recharts, nên đổi sang tự vẽ SVG chỉ phải sửa file này. Mỗi biểu đồ có bảng số đọc được ngay dưới
// ("Xem bảng số"). Màu chuỗi lấy từ biến CSS --chart-N (styles/tokens.css): bảng màu kiểm theo kỹ năng dataviz (phân biệt
// được khi mù màu đỏ-lục, tương phản ≥ 3:1 với nền thẻ ở cả hai chế độ). Chữ của chú giải và tooltip luôn là màu mực trung
// tính; màu chuỗi chỉ ở ô màu bên cạnh.
import type { ReactNode } from "react";
import { Bar, BarChart, type BarShapeProps, CartesianGrid, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompact } from "../format";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { IconChart } from "./icons";

export interface ChartSeries {
  key: string;
  label: string;
}

/** Một dòng dữ liệu: `label` là nhãn trục X, các khóa còn lại là giá trị của từng chuỗi. */
export interface ChartRow {
  label: string;
  [seriesKey: string]: string | number;
}

/** Màu theo thứ tự chuỗi, cố định (không xoay vòng theo hạng): chuỗi thứ i luôn là --chart-(i+1). */
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const AXIS_TICK = { fill: "var(--ink-3)", fontSize: 11 };

const valueOf = (row: ChartRow, key: string): number => {
  const v = row[key];
  return typeof v === "number" ? v : 0;
};

/** Đầu cột bo 3px. */
const TOP_RADIUS: [number, number, number, number] = [3, 3, 0, 0];

/** Chuỗi nằm trên cùng của cột chồng ở một mốc: chuỗi cuối có giá trị khác 0 (chuỗi sau bằng 0 thì không vẽ đoạn nào). */
export function topSeries(row: ChartRow | undefined, series: readonly ChartSeries[]): string | undefined {
  if (!row) return undefined;
  for (let i = series.length - 1; i >= 0; i--) {
    const s = series[i] as ChartSeries;
    if (valueOf(row, s.key) !== 0) return s.key;
  }
  return undefined;
}

interface TooltipEntry {
  dataKey?: unknown;
  name?: unknown;
  value?: unknown;
  color?: string;
}

/** Tooltip cùng phong cách thẻ (xuất ra để trang thử thành phần vẽ tĩnh): tên mốc, mỗi chuỗi một dòng (ô màu, tên, giá trị căn phải), tổng khi cột chồng. */
export function ChartTooltip({
  active,
  payload,
  label,
  series,
  format,
  stacked,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: unknown;
  series: readonly ChartSeries[];
  format(n: number): string;
  stacked: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((s, p) => s + (typeof p.value === "number" ? p.value : 0), 0);
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{String(label ?? "")}</p>
      <ul>
        {payload.map((p) => {
          const i = series.findIndex((s) => s.key === p.dataKey);
          return (
            <li key={String(p.dataKey)}>
              <span className={`chart-swatch s-${(i < 0 ? 0 : i) % COLORS.length}`} aria-hidden="true" />
              <span className="chart-tooltip-name">{String(p.name ?? p.dataKey)}</span>
              <span className="chart-tooltip-value">{format(Number(p.value))}</span>
            </li>
          );
        })}
      </ul>
      {stacked && payload.length > 1 && (
        <p className="chart-tooltip-total">
          <span>Tổng</span>
          <span>{format(total)}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Hàng trên vùng vẽ: chú giải (từ hai chuỗi; ô màu và tên bằng chữ trung tính, đúng thứ tự chuỗi của trang) và đơn vị bên
 * phải. Nằm ngoài Recharts và luôn cao một dòng (kể cả khi một chuỗi không cần chú giải): các biểu đồ đặt cạnh nhau có vùng
 * vẽ cùng độ cao, trục thẳng hàng.
 */
function ChartKey({ series, unit }: { series: readonly ChartSeries[]; unit?: string }) {
  return (
    <div className="chart-key">
      {series.length > 1 ? (
        <ul className="chart-legend" aria-label="Chú giải">
          {series.map((s, i) => (
            <li key={s.key}>
              <span className={`chart-swatch s-${i % COLORS.length}`} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      ) : (
        <span />
      )}
      {unit && <span className="chart-unit">{unit}</span>}
    </div>
  );
}

export function ChartCard({
  title,
  description,
  actions,
  data,
  series,
  stacked = false,
  format = String,
  labelHeader = "Mốc",
  integer = false,
  unit,
}: {
  title: string;
  /** Một dòng giải thích dưới tiêu đề (đơn vị, cách tính). */
  description?: ReactNode;
  /** Ở góc phải đầu thẻ. */
  actions?: ReactNode;
  data: readonly ChartRow[];
  series: readonly ChartSeries[];
  /** Cột chồng: các chuỗi xếp lên nhau. */
  stacked?: boolean;
  /** Định dạng một giá trị trong bảng số và tooltip (ví dụ fmtVnd). */
  format?: (n: number) => string;
  /** Tiêu đề cột nhãn của bảng số. */
  labelHeader?: string;
  /** Biểu đồ đếm (số đơn, số máy): trục dọc chỉ có số nguyên, không chia vạch 0,5. */
  integer?: boolean;
  /** Đơn vị của trục dọc, hiện ở góc trên phải vùng vẽ (ví dụ "Đồng", "Số đơn"). */
  unit?: string;
}) {
  const empty = data.every((row) => series.every((s) => valueOf(row, s.key) === 0));
  return (
    <Card title={title} description={description} actions={actions} level={3} className="chart-card">
      {empty ? (
        <EmptyState compact icon={<IconChart size={22} />} title="Chưa có dữ liệu trong khoảng này" />
      ) : (
        <>
          <ChartKey series={series} unit={unit} />
          <div className="chart-box" role="img" aria-label={title}>
            <ResponsiveContainer width="100%" height={240}>
              {/* accessibilityLayer tắt: Recharts mặc định biến <svg> thành role="application" nhận Tab (không có vòng focus) nằm
                  trong khung role="img"; người dùng bàn phím đọc số liệu bằng bảng "Xem bảng số" ngay dưới. */}
              <BarChart
                data={data as ChartRow[]}
                margin={{ top: 8, right: 4, bottom: 0, left: -4 }}
                barCategoryGap="22%"
                accessibilityLayer={false}
              >
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  stroke="var(--chart-axis)"
                  tickLine={false}
                  tickMargin={8}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  allowDecimals={!integer}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={6}
                  tickFormatter={(v) => fmtCompact(Number(v))}
                  width={44}
                />
                <Tooltip
                  // Giữ thứ tự chuỗi của trang (mặc định Recharts xếp tooltip theo tên, chú giải theo giá trị).
                  itemSorter={(item) => series.findIndex((x) => x.key === item.dataKey)}
                  formatter={(v) => format(Number(v))}
                  cursor={{ fill: "var(--chart-cursor)" }}
                  isAnimationActive={false}
                  content={<ChartTooltip series={series} format={format} stacked={stacked} />}
                />
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId={stacked ? "chong" : undefined}
                    fill={COLORS[i % COLORS.length]}
                    // Đầu cột bo 3px. Cột chồng: chỉ đoạn trên cùng của từng mốc được bo (tháng có chuỗi cuối bằng 0 thì đoạn của
                    // chuỗi bên dưới là đỉnh cột). Khe 1px màu nền thẻ giữa các đoạn chồng.
                    radius={stacked ? undefined : TOP_RADIUS}
                    shape={
                      stacked
                        ? (p: BarShapeProps) => <Rectangle {...p} radius={topSeries(p.payload as ChartRow | undefined, series) === s.key ? TOP_RADIUS : 0} />
                        : undefined
                    }
                    stroke="var(--surface)"
                    strokeWidth={stacked ? 1 : 0}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="chart-table">
            <summary>Xem bảng số</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{labelHeader}</th>
                    {series.map((s) => (
                      <th key={s.key} scope="col" className="num">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.label}>
                      <td data-label={labelHeader}>{row.label}</td>
                      {series.map((s) => (
                        <td key={s.key} data-label={s.label} className="num">
                          {format(valueOf(row, s.key))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </Card>
  );
}
