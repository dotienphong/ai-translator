import { EmptyState } from "../../../components/EmptyState";
import { useT } from "../appStore";
import { useTranscript } from "../dataStores";
import { TranscriptView } from "../TranscriptView";

// Màn hình Bản chép lời (F4): phiên đang dịch, hoặc phiên vừa dừng (bản trong bộ nhớ, §6.6).
export function TranscriptScreen() {
  const t = useT();
  const transcript = useTranscript((s) => s.transcript);
  if (!transcript || transcript.lines.length === 0) return <EmptyState icon="captions" text={t("transcript.empty")} />;
  return <TranscriptView transcript={transcript} source={{ kind: "current" }} />;
}
