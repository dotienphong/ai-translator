import type { UiError } from "../../../store/app";
import type { NotesNotice } from "../../../store/notes";

// Thông báo của màn hình Ghi chú: một lúc chỉ hiện MỘT cái, cái gấp nhất trước (trước đây tới năm khung xếp chồng làm màn hình rối).
// Thứ tự: hỏi bỏ bản sửa, lỗi của store, lỗi của việc tạo, ghi chú mới hơn trong lúc sửa, thông báo đã sao chép/xuất, rồi cảnh báo
// phiên chưa lưu. Cái nào bị che sẽ hiện lại khi cái trên đóng hay hết hiệu lực.
export type Banner =
  | { kind: "discard" }
  | { kind: "error"; code: string }
  | { kind: "failure"; code: string }
  | { kind: "stale" }
  | { kind: "notice"; notice: NotesNotice }
  | { kind: "unsaved" };

export interface BannerInput {
  // Đang hỏi bỏ bản sửa trước khi đổi phiên.
  confirmDiscard: boolean;
  // Lỗi của lệnh (store): hết chỗ, đang bận…
  error: UiError | null;
  // Mã lỗi của việc tạo ghi chú đã thất bại.
  failure: string | null;
  editing: boolean;
  // Ghi chú mới hơn về trong lúc sửa tay; chỉ có nghĩa khi đang sửa.
  staleDraft: boolean;
  notice: NotesNotice | null;
  // Ghi chú của phiên chưa lưu vào Lịch sử.
  unsaved: boolean;
}

export function pickBanner(i: BannerInput): Banner | null {
  if (i.confirmDiscard) return { kind: "discard" };
  if (i.error) return { kind: "error", code: i.error.code };
  if (i.failure !== null) return { kind: "failure", code: i.failure };
  if (i.editing && i.staleDraft) return { kind: "stale" };
  if (i.notice) return { kind: "notice", notice: i.notice };
  if (i.unsaved) return { kind: "unsaved" };
  return null;
}
