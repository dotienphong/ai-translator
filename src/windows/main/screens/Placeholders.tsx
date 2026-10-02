import { EmptyState } from "../../../components/EmptyState";
import { useT } from "../appStore";

// Khung các màn hình mà kế hoạch sau làm nội dung: từ điển (03, task sau), nâng cấp Pro (06).
export function Glossary() {
  return <EmptyState text={useT()("glossary.empty")} />;
}

export function Upgrade() {
  return <EmptyState text={useT()("upgrade.empty")} />;
}
