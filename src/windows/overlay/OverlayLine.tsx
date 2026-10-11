import { memo } from "react";
import { type UiLanguage, translate } from "../../i18n";
import type { Subtitle } from "../../lib/ipc";
import { lineView } from "../../lib/subtitleView";

// Một dòng của thanh phụ đề (§4.4; H8 của kế hoạch 00 "dịch trong lúc người nói chưa dừng"). Memo theo từng dòng (spec
// 2026-10-10 §8, A4): props là đối tượng phụ đề và hai giá trị nguyên thủy, so nông là đủ. Mỗi gói chữ dịch
// (`subtitle://delta`) chỉ đổi đối tượng của đúng một dòng (`appendDelta`, `upsertLine` giữ nguyên các dòng khác), nên các
// dòng khác không vẽ lại. Kế hoạch 03 thêm prop tùy chọn `dimProvisional` và dòng đang nói (`LiveLineView.tsx`).
export interface OverlayLineProps {
  line: Subtitle;
  showSource: boolean;
  uiLanguage: UiLanguage;
}

export const OverlayLine = memo(function OverlayLine({ line, showSource, uiLanguage }: OverlayLineProps) {
  const v = lineView(line, showSource);
  const classes = ["line", v.kind, v.provisional ? "provisional" : ""].filter(Boolean).join(" ");
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
