import { memo } from "react";
import { type UiLanguage, translate } from "../../i18n";
import type { Subtitle } from "../../lib/ipc";
import { lineView } from "../../lib/subtitleView";

// Một dòng của thanh phụ đề (§4.4; H8 của kế hoạch 00 "dịch trong lúc người nói chưa dừng"). Memo theo từng dòng (spec
// 2026-10-10 §8, A4): props là đối tượng phụ đề và các giá trị nguyên thủy, so nông là đủ. Mỗi gói chữ dịch
// (`subtitle://delta`) chỉ đổi đối tượng của đúng một dòng (`appendDelta`, `upsertLine` giữ nguyên các dòng khác), nên các
// dòng khác không vẽ lại. Dòng đang nói vẽ ở `LiveLineView.tsx`, cùng cấu trúc `.line`, `.source`, `.main`.
export interface OverlayLineProps {
  line: Subtitle;
  showSource: boolean;
  uiLanguage: UiLanguage;
  // Phụ đề tạm (§6.3 spec chính) nhạt cả dòng. Khi đang dịch trong lúc người nói chưa dừng thì không (spec 2026-10-10 §6.1):
  // chỉ phần tạm của dòng đang nói nhạt. Mặc định `true`.
  dimProvisional?: boolean;
}

export const OverlayLine = memo(function OverlayLine({
  line,
  showSource,
  uiLanguage,
  dimProvisional = true,
}: OverlayLineProps) {
  const v = lineView(line, showSource);
  const classes = ["line", v.kind, dimProvisional && v.provisional ? "provisional" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      {v.source && <div className="source">{v.source}</div>}
      <div className="main">
        {v.kind === "dropped" ? translate(uiLanguage, "subtitle.dropped") : v.main}
        {v.kind === "failed" && <span className="tag">{translate(uiLanguage, "subtitle.failed")}</span>}
      </div>
    </div>
  );
});
