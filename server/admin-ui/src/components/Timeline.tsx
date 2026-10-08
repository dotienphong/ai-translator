// Dòng thời gian dọc cho nhật ký (spec giao diện mới, mục 2): mỗi mốc có giờ, tác nhân, mã hành động (mono), chi tiết và
// liên kết; mốc chia nhóm theo ngày. Là danh sách có thứ tự (<ol>), mốc mới nhất ở trên theo thứ tự truyền vào.
import type { ReactNode } from "react";

export type TimelineTone = "default" | "ok" | "warn" | "bad" | "info";

export interface TimelineItem {
  key: string;
  /** Giờ hiển thị, ví dụ "14:01". */
  time: string;
  /** Giá trị máy đọc cho <time dateTime>, ví dụ ISO 8601. */
  dateTime?: string;
  /** Nhãn nhóm ngày, ví dụ "08/10/2026". Mốc liền nhau cùng nhãn thì chung một tiêu đề ngày. */
  day?: string;
  actor: ReactNode;
  /** Mã hành động (license_revoked…), hiện chữ mono. */
  action: string;
  /** Tên dễ đọc của hành động, nếu có. */
  title?: ReactNode;
  detail?: ReactNode;
  /** Liên kết tới license, đơn… */
  links?: ReactNode;
  tone?: TimelineTone;
}

export function Timeline({ items, label, className }: { items: readonly TimelineItem[]; label?: string; className?: string }) {
  const out: ReactNode[] = [];
  let lastDay: string | undefined;
  for (const it of items) {
    if (it.day !== undefined && it.day !== lastDay) {
      out.push(
        <li key={`day-${it.day}-${it.key}`} className="tl-day" aria-hidden="true">
          {it.day}
        </li>,
      );
      lastDay = it.day;
    }
    out.push(
      <li key={it.key} className={`tl-item tone-${it.tone ?? "default"}`}>
        <span className="tl-dot" aria-hidden="true" />
        <div className="tl-main">
          <time className="tl-time" dateTime={it.dateTime}>
            {/* Ngày đọc cho trình đọc màn hình (tiêu đề ngày chỉ để nhìn). */}
            {it.day !== undefined && <span className="sr-only">{it.day} </span>}
            {it.time}
          </time>
          <div className="tl-head">
            {it.title ? <span className="tl-title">{it.title}</span> : null}
            <code className="tl-action">{it.action}</code>
            <span className="tl-actor">{it.actor}</span>
          </div>
          {it.detail ? <div className="tl-detail">{it.detail}</div> : null}
          {it.links ? <div className="tl-links">{it.links}</div> : null}
        </div>
      </li>,
    );
  }
  return (
    <ol className={className ? `timeline ${className}` : "timeline"} aria-label={label}>
      {out}
    </ol>
  );
}
