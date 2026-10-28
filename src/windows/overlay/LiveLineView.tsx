import { type CSSProperties, memo } from "react";
import { TwoTier } from "../../components/TwoTier";
import type { LiveLine, SpeakerVoice } from "../../lib/ipc";
import { speakerColor } from "../../lib/speakers";

// Dòng đang nói của thanh phụ đề (spec 2026-10-10 §6.1; H8 của kế hoạch 00): cùng cấu trúc `.line`, `.source`, `.main` với
// `OverlayLine`, thêm lớp `live`. Câu gốc (khi bật "hiện câu gốc") và bản dịch đều hai tầng (`TwoTier`): phần ổn định giữ
// độ đậm bình thường, phần tạm nhạt. Chưa có chữ dịch (đang chờ bản dịch tạm đầu, câu đã là ngôn ngữ đích, dịch không khả
// dụng) thì dòng chính là câu gốc hai tầng, không có dòng câu gốc nhỏ. Memo so nông như `OverlayLine`: mỗi lần
// `subtitle://live` chỉ đổi đối tượng của đúng một dòng.
//
// Người nói (QĐ 5 của kế hoạch 03 phân biệt người nói): dòng nối tiếp một câu mang giọng của câu đó (`LiveLine.speaker`), vẽ như
// `OverlayLine`; lượt nói mới chưa có giọng thì như cũ.
export interface LiveLineViewProps {
  live: LiveLine;
  showSource: boolean;
  voice?: SpeakerVoice | null;
  turnStart?: boolean;
}

export const LiveLineView = memo(function LiveLineView({
  live,
  showSource,
  voice = null,
  turnStart = false,
}: LiveLineViewProps) {
  const translated = live.tgt_stable !== "" || live.tgt_tail !== "";
  const body = (
    <>
      {translated && showSource && (
        <div className="source">
          <TwoTier stable={live.src_stable} tail={live.src_tail} />
        </div>
      )}
      <div className="main">
        {translated ? (
          <TwoTier stable={live.tgt_stable} tail={live.tgt_tail} />
        ) : (
          <TwoTier stable={live.src_stable} tail={live.src_tail} />
        )}
      </div>
    </>
  );
  if (!voice) return <div className="line live">{body}</div>;
  return (
    <div className="line live spk" style={{ "--spk": speakerColor(voice.color) } as CSSProperties}>
      {turnStart && <div className="spk-label">{voice.label}</div>}
      <div className="spk-body">{body}</div>
    </div>
  );
});
