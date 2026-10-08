// Ô số (spec giao diện mới, mục 2): nhãn, giá trị lớn (số tabular), ghi chú, biểu tượng và tông tùy chọn, xu hướng tùy chọn.
// StatGrid xếp các ô thành lưới; mỗi ô là subgrid ba hàng (nhãn, số, ghi chú) nên nhãn dài xuống hai dòng ở ô này không làm
// lệch số của các ô cùng hàng.
import type { ReactNode } from "react";
import { IconTrendDown, IconTrendUp } from "./icons";

export type StatTone = "default" | "brand" | "ok" | "warn" | "bad" | "info";

export interface StatDelta {
  /** Chữ của xu hướng, ví dụ "+12%" hay "+3 so với tuần trước". */
  label: string;
  direction: "up" | "down" | "flat";
  /** Tăng là tốt (doanh thu) hay xấu (lỗi): quyết định màu. Mặc định: tăng là tốt. */
  upIsGood?: boolean;
}

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  delta?: StatDelta;
  className?: string;
}

export function Stat({ label, value, note, icon, tone = "default", delta, className }: StatProps) {
  const cls = ["stat", tone !== "default" && `tone-${tone}`, className].filter(Boolean).join(" ");
  let deltaEl: ReactNode = null;
  if (delta) {
    const good = delta.direction === "flat" ? null : (delta.direction === "up") === (delta.upIsGood ?? true);
    const dcls = `stat-delta ${good === null ? "is-flat" : good ? "is-good" : "is-bad"}`;
    deltaEl = (
      <span className={dcls}>
        {delta.direction === "up" ? <IconTrendUp size={14} strokeWidth={2} /> : delta.direction === "down" ? <IconTrendDown size={14} strokeWidth={2} /> : null}
        {delta.label}
      </span>
    );
  }
  return (
    <div className={cls}>
      <span className="stat-label">
        {icon && <span className="stat-icon">{icon}</span>}
        <span className="stat-label-text">{label}</span>
      </span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-foot">
        {deltaEl}
        {note && <span className="stat-note">{note}</span>}
      </span>
    </div>
  );
}

/** Lưới ô số: tự chia cột theo bề rộng (tối thiểu 176px mỗi ô), điện thoại hai cột. `label` đặt tên nhóm cho trình đọc màn hình. */
export function StatGrid({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div className={className ? `stat-grid ${className}` : "stat-grid"} role={label ? "group" : undefined} aria-label={label}>
      {children}
    </div>
  );
}
