import { EmptyState } from "../../../components/EmptyState";
import { useT } from "../appStore";

// Khung các màn hình mà kế hoạch sau làm nội dung: bản chép lời, lịch sử, từ điển (03), nâng cấp Pro (06).
export function Transcript() {
  return <EmptyState text={useT()("transcript.empty")} />;
}

export function History() {
  return <EmptyState text={useT()("history.empty")} />;
}

export function Glossary() {
  return <EmptyState text={useT()("glossary.empty")} />;
}

export function Upgrade() {
  return <EmptyState text={useT()("upgrade.empty")} />;
}
