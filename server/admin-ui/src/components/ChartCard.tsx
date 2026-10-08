// Một biểu đồ cột của trang Tổng quan (spec Web Admin phần 2, mục 4 và 5). Bọc Recharts: trang không biết kiểu của Recharts,
// nên đổi sang tự vẽ SVG chỉ phải sửa file này. Mỗi biểu đồ có bảng số đọc được ngay dưới ("Xem bảng số").
// Màu lấy từ biến CSS --chart-N (styles/tokens.css, sáng hay tối theo hệ điều hành).
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompact } from "../format";

export interface ChartSeries {
  key: string;
  label: string;
}

/** Một dòng dữ liệu: `label` là nhãn trục X, các khóa còn lại là giá trị của từng chuỗi. */
export interface ChartRow {
  label: string;
  [seriesKey: string]: string | number;
}

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

const valueOf = (row: ChartRow, key: string): number => {
  const v = row[key];
  return typeof v === "number" ? v : 0;
};

export function ChartCard({
  title,
  data,
  series,
  stacked = false,
  format = String,
  labelHeader = "Mốc",
  integer = false,
}: {
  title: string;
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
}) {
  const empty = data.every((row) => series.every((s) => valueOf(row, s.key) === 0));
  return (
    <section className="chart-card">
      <h3>{title}</h3>
      {empty ? (
        <p className="muted">Chưa có dữ liệu trong khoảng này</p>
      ) : (
        <>
          <div className="chart-box" role="img" aria-label={title}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data as ChartRow[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--line)" interval="preserveStartEnd" />
                <YAxis allowDecimals={!integer} tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--line)" tickFormatter={(v) => fmtCompact(Number(v))} width={48} />
                <Tooltip
                  // Giữ thứ tự chuỗi của trang (mặc định Recharts xếp tooltip theo tên, chú giải theo giá trị).
                  itemSorter={(item) => series.findIndex((x) => x.key === item.dataKey)}
                  formatter={(v) => format(Number(v))}
                  contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
                />
                {series.length > 1 && <Legend itemSorter={null} />}
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId={stacked ? "chong" : undefined}
                    fill={COLORS[i % COLORS.length]}
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
                    <th>{labelHeader}</th>
                    {series.map((s) => (
                      <th key={s.key}>{s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.label}>
                      <td data-label={labelHeader}>{row.label}</td>
                      {series.map((s) => (
                        <td key={s.key} data-label={s.label}>
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
    </section>
  );
}
