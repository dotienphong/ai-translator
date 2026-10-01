// Trạng thái trống của màn hình chưa có dữ liệu hay chưa có chức năng.
export function EmptyState({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}
