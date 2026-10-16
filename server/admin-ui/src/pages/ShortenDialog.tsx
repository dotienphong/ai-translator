// Hộp "Rút ngắn hạn…" (Q2, C1-T7), dùng chung ở trang đơn (rút đúng phần của một đơn đã hoàn, có mã đơn) và trang license (tự
// chọn số ngày, không mã đơn). Chống trừ hai lần:
// - Hạn được chốt lúc mở hộp và gửi làm `expected_expires_at`: hạn trên server đã khác (trang cũ, tab khác vừa rút, hay lần gửi
//   trước sau lỗi mạng đã được ghi) thì server trả 409 conflict. Trang tải lại mà hộp vẫn gửi hạn đã chốt, không bao giờ gửi
//   hạn mới hơn mà người vận hành chưa nhìn thấy khi quyết định số ngày.
// - Gặp 409 conflict thì hộp đóng (onStale: trang tải lại và báo); muốn rút tiếp thì mở lại hộp, số ngày và thẻ của trang tính
//   lại từ dữ liệu mới.
// - Lỗi không rõ kết quả (mất kết nối, 5xx) thì ConfirmDialog khóa nút gửi tới khi đóng hộp.
// Số ngày nhiều nhất tính như server (hạn mới phải sau bây giờ); server vẫn là bên quyết, và khi từ chối (too_far) thì câu lỗi dùng
// `max_days` của server.
import { useState } from "react";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { fmtDate } from "../format";
import { maxShortenDays } from "./refund-kit";

const DAY = 86400;

export interface ShortenDialogProps {
  licenseId: string;
  /** Hạn đang hiển thị của license lúc mở hộp (chốt lại, gửi làm expected_expires_at). */
  expiresAt: number;
  now: number;
  /** Số ngày điền sẵn (phần của đơn đã hoàn); không có thì ô trống. */
  initialDays?: number;
  /** Đơn đã hoàn mà lần rút này lấy lại phần thời gian của nó (trang đơn). */
  orderCode?: number;
  /** Đơn đổi gói: nhắc rút ngắn không đổi lại gói. */
  planChange?: boolean;
  onDone(result: { license_id: string; expires_at: number }): void;
  /** 409 conflict: hộp đóng; trang tải lại và hiện `message`. */
  onStale(message: string): void;
  /** Lỗi 409/404 khác: hộp còn mở, trang tải lại. */
  onConflict(): void;
  onClose(): void;
}

export function ShortenDialog(p: ShortenDialogProps) {
  const [expected] = useState(p.expiresAt);
  const [days, setDays] = useState(p.initialDays !== undefined && p.initialDays > 0 ? String(p.initialDays) : "");
  const max = maxShortenDays(expected, p.now);
  const n = Number(days);
  const ok = days !== "" && Number.isInteger(n) && n >= 1 && n <= max;
  const error =
    max < 1
      ? "License còn chưa tới một ngày: không rút ngắn được; muốn lấy lại hết thì Thu hồi."
      : days !== "" && !ok
        ? `Nhập số nguyên từ 1 đến ${max} (hạn mới phải sau bây giờ).`
        : undefined;
  return (
    <ConfirmDialog
      title="Rút ngắn hạn license?"
      description={
        <>
          {ok
            ? `Trừ ${n} ngày khỏi hạn (${fmtDate(expected)} → ${fmtDate(expected - n * DAY)}).`
            : `Trừ số ngày nhập dưới đây khỏi hạn (hạn hiện tại ${fmtDate(expected)}).`}{" "}
          Không thể xuống tới thời điểm hiện tại; muốn lấy lại hết thì Thu hồi. Muốn trả lại thì dùng Gia hạn.
          {p.planChange && " Rút ngắn không đổi lại gói."} Máy khách còn dùng hạn cũ tới lần kiểm tra kế tiếp (mỗi 24 giờ; máy offline tới
          14 ngày).{" "}
          {p.orderCode !== undefined
            ? `Nhật ký ghi lần rút này cho đơn #${p.orderCode}.`
            : "Rút ngắn không kèm mã đơn: trang đơn sẽ không biết lần rút này. Rút phần của một đơn đã hoàn tiền thì mở hộp từ trang đơn đó; ở đây ghi lý do rõ vào ô Lý do."}
        </>
      }
      confirmLabel="Rút ngắn"
      needsNote
      typeToConfirm="RUT NGAN"
      extraValid={ok}
      focusExtraFirst
      onConfirm={async (note) => {
        try {
          p.onDone(await api.shorten(p.licenseId, n, note, expected, p.orderCode));
        } catch (e) {
          // Hạn đã đổi: không để hộp mở với hạn cũ và lời mời gửi lại; đóng hộp (ConfirmDialog đóng khi onConfirm xong).
          if (e instanceof ApiError && e.code === "conflict") {
            p.onStale(e.message);
            return;
          }
          throw e;
        }
      }}
      onConflict={p.onConflict}
      onClose={p.onClose}
    >
      <Field label="Số ngày" hint={`Số nguyên từ 1 đến ${max}.`} error={error}>
        <input type="number" min={1} max={Math.max(1, max)} value={days} aria-invalid={error !== undefined} onChange={(e) => setDays(e.target.value)} />
      </Field>
    </ConfirmDialog>
  );
}
