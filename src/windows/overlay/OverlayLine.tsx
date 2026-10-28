import { type CSSProperties, memo } from "react";
import { type UiLanguage, translate } from "../../i18n";
import type { SpeakerVoice, Subtitle } from "../../lib/ipc";
import { speakerColor } from "../../lib/speakers";
import { lineView } from "../../lib/subtitleView";

// Một dòng của thanh phụ đề (§4.4; H8 của kế hoạch 00 "dịch trong lúc người nói chưa dừng"). Memo theo từng dòng (spec
// 2026-10-10 §8, A4): props là đối tượng phụ đề, đối tượng giọng và các giá trị nguyên thủy, so nông là đủ. Mỗi gói chữ dịch
// (`subtitle://delta`) chỉ đổi đối tượng của đúng một dòng (`appendDelta`, `upsertLine` giữ nguyên các dòng khác), và bảng giọng
// mới giữ nguyên đối tượng của giọng không đổi (`mergeVoices`), nên các dòng khác không vẽ lại. Dòng đang nói vẽ ở
// `LiveLineView.tsx`, cùng cấu trúc `.line`, `.source`, `.main`.
//
// Người nói (spec 2026-10-26-phan-biet-nguoi-noi §8.1): dòng có giọng thì vạch màu bên trái (`.spk-body`), dòng đầu lượt nói thêm tên
// có màu phía trên (`.spk-label`); không có giọng thì vẽ đúng như trước khi có tính năng.
export interface OverlayLineProps {
  line: Subtitle;
  showSource: boolean;
  uiLanguage: UiLanguage;
  // Phụ đề tạm (§6.3 spec chính) nhạt cả dòng. Khi đang dịch trong lúc người nói chưa dừng thì không (spec 2026-10-10 §6.1):
  // chỉ phần tạm của dòng đang nói nhạt. Mặc định `true`.
  dimProvisional?: boolean;
  // Giọng của dòng; `null` (chưa xác định, tính năng tắt) thì vẽ như cũ.
  voice?: SpeakerVoice | null;
  // Dòng đầu của lượt nói: tên có màu phía trên.
  turnStart?: boolean;
}

export const OverlayLine = memo(function OverlayLine({
  line,
  showSource,
  uiLanguage,
  dimProvisional = true,
  voice = null,
  turnStart = false,
}: OverlayLineProps) {
  const v = lineView(line, showSource);
  const classes = ["line", v.kind, dimProvisional && v.provisional ? "provisional" : "", voice ? "spk" : ""]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      {v.source && <div className="source">{v.source}</div>}
      <div className="main">
        {v.kind === "dropped" ? translate(uiLanguage, "subtitle.dropped") : v.main}
        {v.kind === "failed" && <span className="tag">{translate(uiLanguage, "subtitle.failed")}</span>}
      </div>
    </>
  );
  if (!voice) return <div className={classes}>{body}</div>;
  return (
    <div className={classes} style={{ "--spk": speakerColor(voice.color) } as CSSProperties}>
      {turnStart && <div className="spk-label">{voice.label}</div>}
      <div className="spk-body">{body}</div>
    </div>
  );
});
