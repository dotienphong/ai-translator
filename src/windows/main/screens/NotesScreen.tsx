import { EmptyState } from "../../../components/EmptyState";
import { useT } from "../appStore";

// Màn hình "Ghi chú cuộc họp". Ở bước này mới là khung: chưa có phiên nào để ghi chú. Phần thật nối ở các task sau.
export function NotesScreen() {
  const t = useT();
  return <EmptyState icon="notes" text={t("notes.empty")} />;
}
