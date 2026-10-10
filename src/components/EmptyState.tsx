import { Icon, type IconName } from "./Icon";

// Trạng thái trống của màn hình chưa có dữ liệu hay chưa có chức năng.
export function EmptyState({ text, icon = "file" }: { text: string; icon?: IconName }) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={30} />
      <p className="empty">{text}</p>
    </div>
  );
}
