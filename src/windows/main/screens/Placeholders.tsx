import { EmptyState } from "../../../components/EmptyState";
import { useT } from "../appStore";

// Khung màn hình mà kế hoạch 06 làm nội dung: nâng cấp Pro.
export function Upgrade() {
  return <EmptyState text={useT()("upgrade.empty")} />;
}
