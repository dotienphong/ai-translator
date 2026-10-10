import { Icon } from "./Icon";

// Màn hình của tính năng Pro khi đang ở gói Free (Đ6): nói rõ là tính năng Pro, kèm nút mở màn hình Nâng cấp.
export function ProLocked({ text, upgradeLabel, onUpgrade }: { text: string; upgradeLabel: string; onUpgrade: () => void }) {
  return (
    <div className="card locked">
      <span className="badge-icon">
        <Icon name="lock" size={22} />
      </span>
      <p>{text}</p>
      <button className="primary" onClick={onUpgrade}>
        <Icon name="upgrade" size={16} />
        {upgradeLabel}
      </button>
    </div>
  );
}
