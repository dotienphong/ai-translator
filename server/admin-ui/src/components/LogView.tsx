// Hiện log của báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4). Log do app gửi lên (đã che dữ liệu cá nhân) nhưng
// vẫn là dữ liệu từ ngoài: CHỈ hiện dạng chuỗi văn bản trong <pre> (React thoát ký tự), không bao giờ dangerouslySetInnerHTML,
// innerHTML hay Markdown. Khung cuộn được bằng bàn phím (tabIndex 0, role region có tên).
import { fmtBytes, fmtInt } from "../format";
import { EmptyState } from "./EmptyState";

/** Số dòng của `text`: dấu xuống dòng cuối không tạo thêm dòng trống. */
export function countLines(text: string): number {
  if (text === "") return 0;
  const n = text.split("\n").length;
  return text.endsWith("\n") ? n - 1 : n;
}

export function LogView({ label, text, emptyHint }: { label: string; text: string; emptyHint?: string }) {
  if (text === "") return <EmptyState compact title="Log trống" hint={emptyHint} />;
  return (
    <div className="log-view">
      <p className="log-meta">{`${fmtInt(countLines(text))} dòng · ${fmtBytes(new TextEncoder().encode(text).length)}`}</p>
      <pre className="log-pre" tabIndex={0} role="region" aria-label={label}>
        {text}
      </pre>
    </div>
  );
}
