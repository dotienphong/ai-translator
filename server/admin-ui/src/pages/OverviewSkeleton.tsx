// Khung chờ của trang Tổng quan, tách khỏi OverviewPage (nạp lười cùng Recharts): App dùng làm fallback của Suspense nên
// lúc tải phần nạp lười và lúc tải số liệu là cùng một khung, không nhảy bố cục.
import { Button } from "../components/Button";
import { IconRefresh } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { LoadingBlock, SkeletonBlock, SkeletonLine, SkeletonStat } from "../components/Skeleton";
import { StatGrid } from "../components/Stat";

export const OVERVIEW_DESC = "Tiền, khách hàng, sức khỏe đơn và mức sử dụng app; giờ Việt Nam.";

/** Năm ô số và hai thẻ biểu đồ chờ (nhóm Tiền), cùng kích thước với nội dung thật. */
export function OverviewSkeleton() {
  return (
    <LoadingBlock label="Đang tải số liệu…">
      <StatGrid className="ov-stats">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonStat key={i} note={i >= 2} />
        ))}
      </StatGrid>
      <div className="ui-section ov-skel-section" aria-hidden="true">
        <div className="ui-section-head">
          <div className="ui-section-heading">
            <SkeletonLine width="xs" size="xs" className="ov-skel-title" />
            <SkeletonLine width="sm" size="sm" className="ov-skel-desc" />
          </div>
        </div>
        <div className="chart-grid">
          {[0, 1].map((i) => (
            <div key={i} className="ui-card">
              <div className="ui-card-head">
                <div className="ui-card-heading">
                  <SkeletonLine width="md" size="md" />
                  <SkeletonLine width="sm" size="sm" />
                </div>
              </div>
              <div className="ui-card-body">
                <SkeletonBlock height="chart" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </LoadingBlock>
  );
}

/** Fallback của Suspense: đầu trang và khung chờ, nút Làm mới ở trạng thái đang tải (giống trang thật lúc tải lần đầu). */
export function OverviewFallback() {
  return (
    <>
      <PageHeader
        title="Tổng quan"
        description={<p className="page-meta">{OVERVIEW_DESC}</p>}
        actions={
          <Button icon={<IconRefresh size={16} />} loading>
            Làm mới
          </Button>
        }
      />
      <OverviewSkeleton />
    </>
  );
}
