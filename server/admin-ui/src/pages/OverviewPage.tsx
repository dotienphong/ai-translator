// Khung của trang Tổng quan (Task 3); Task 6 thay bằng trang đầy đủ dùng GET /admin/stats.
import { ChartCard } from "../components/ChartCard";

export function OverviewPage() {
  return (
    <>
      <h1>Tổng quan</h1>
      <ChartCard
        title="Biểu đồ mẫu"
        labelHeader="Ngày"
        series={[{ key: "revenue", label: "Doanh thu" }]}
        data={[
          { label: "01/10", revenue: 50000 },
          { label: "02/10", revenue: 100000 },
          { label: "03/10", revenue: 0 },
        ]}
      />
    </>
  );
}
