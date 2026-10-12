import { memo } from "react";
import { TwoTier } from "../../components/TwoTier";
import type { LiveLine } from "../../lib/ipc";

// Dòng đang nói của thanh phụ đề (spec 2026-10-10 §6.1; H8 của kế hoạch 00): cùng cấu trúc `.line`, `.source`, `.main` với
// `OverlayLine`, thêm lớp `live`. Câu gốc (khi bật "hiện câu gốc") và bản dịch đều hai tầng (`TwoTier`): phần ổn định giữ
// độ đậm bình thường, phần tạm nhạt. Chưa có chữ dịch (đang chờ bản dịch tạm đầu, câu đã là ngôn ngữ đích, dịch không khả
// dụng) thì dòng chính là câu gốc hai tầng, không có dòng câu gốc nhỏ. Memo so nông như `OverlayLine`: mỗi lần
// `subtitle://live` chỉ đổi đối tượng của đúng một dòng.
export interface LiveLineViewProps {
  live: LiveLine;
  showSource: boolean;
}

export const LiveLineView = memo(function LiveLineView({ live, showSource }: LiveLineViewProps) {
  const translated = live.tgt_stable !== "" || live.tgt_tail !== "";
  return (
    <div className="line live">
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
    </div>
  );
});
