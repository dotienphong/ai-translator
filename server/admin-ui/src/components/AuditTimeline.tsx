// Nhật ký dạng dòng thời gian (spec giao diện mới, mục 2): trang Nhật ký và nhật ký trong trang chi tiết (đơn, license,
// máy). Mốc nhóm theo ngày (Hôm nay, Hôm qua, ngày cũ hơn kèm thứ trong tuần), tên tiếng Việt và tông từ audit-labels, mã hành động mono.
import { actionLabel, actionTone } from "../audit-labels";
import { fmtDate, fmtDetail, fmtHm, fmtWeekday, isoOf } from "../format";
import { ActorBadge, type AnyAudit, AuditLinks } from "./columns";
import { LoadingBlock, SkeletonLine } from "./Skeleton";
import { Timeline, type TimelineItem } from "./Timeline";

export function AuditTimeline({ rows, now, label, omit }: { rows: readonly AnyAudit[]; now: number; label: string; omit?: "order" }) {
  const today = fmtDate(now);
  const yesterday = fmtDate(now - 86400);
  const items: TimelineItem[] = rows.map((a, i) => {
    const d = fmtDate(a.at);
    const linked = ("license_id" in a && a.license_id) || (a.order_code !== null && omit !== "order");
    return {
      key: "id" in a ? String(a.id) : `${a.at}-${i}`,
      time: fmtHm(a.at),
      dateTime: isoOf(a.at),
      day: d === today ? `Hôm nay · ${d}` : d === yesterday ? `Hôm qua · ${d}` : `${fmtWeekday(a.at)} · ${d}`,
      actor: <ActorBadge actor={a.actor} />,
      action: a.action,
      title: actionLabel(a.action),
      detail: fmtDetail(a.detail) || undefined,
      links: linked ? <AuditLinks a={a} omit={omit} /> : undefined,
      tone: actionTone(a.action),
    };
  });
  return <Timeline items={items} label={label} />;
}

/** Khung chờ cùng dáng dòng thời gian: tiêu đề ngày và vài mốc. */
export function TimelineSkeleton({ label, className, rows = 6 }: { label: string; className?: string; rows?: number }) {
  return (
    <LoadingBlock label={label} className={className}>
      <ol className="timeline" aria-hidden="true">
        <li className="tl-day">
          <SkeletonLine width="sm" size="xs" />
        </li>
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="tl-item">
            <span className="tl-dot" />
            <div className="tl-main">
              <span className="tl-time">
                <SkeletonLine width="full" size="sm" />
              </span>
              <SkeletonLine width={i % 2 ? "lg" : "md"} />
              <SkeletonLine width={i % 3 ? "xl" : "lg"} size="sm" />
            </div>
          </li>
        ))}
      </ol>
    </LoadingBlock>
  );
}
