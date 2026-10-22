import { useEffect, useState } from "react";
import { isBrowserOrder, orderFinished } from "../../../lib/license";
import { fallbackLanguage, useApp } from "../appStore";
import { useLicense } from "../licenseStore";
import { UpgradeView } from "./UpgradeView";

// Màn hình Nâng cấp (§4.3; spec 2026-10-07 §1, 2026-10-13, 2026-10-14, 2026-10-22): đủ 4 gói, Free dùng thử 10 ngày, Monthly
// 30 ngày, 6 Months 180 ngày, Yearly 365 ngày (giá và số ngày mỗi đơn lấy từ license server, không có mạng thì báo cần mạng),
// đánh dấu gói đang dùng. Ba bước: cách trả (VietQR bằng VND, hay thẻ quốc tế bằng USD khi server bán; chọn sẵn theo ngôn ngữ
// giao diện, đổi được), gói, rồi thanh toán. Chọn gói, nhập email, tick ô đồng ý xử lý email (§10.1). VietQR: quét mã vẽ
// ngay trong app (phía Rust vẽ SVG từ chuỗi `qr_code`), kèm nút mở trang thanh toán của PayOS. Thẻ: không có mã QR, app tự
// mở trang thanh toán trong trình duyệt và hỏi trạng thái tới khi trả xong (tới 24 giờ sau giờ hẹn trả); giá USD chưa gồm
// thuế; Creem là bên bán lại. Đang có key thì đơn là gia hạn hay đổi gói; đổi gói thì hiện trước số ngày quy đổi và ngày hết
// hạn mới, ghi rõ không hoàn tiền. Phần hiển thị ở `UpgradeView`; đây chỉ nối store.
export function UpgradeScreen() {
  const lang = useApp((s) => s.settings?.uiLanguage ?? fallbackLanguage);
  const view = useLicense((s) => s.view);
  const plans = useLicense((s) => s.plans);
  const checkout = useLicense((s) => s.checkout);
  const order = useLicense((s) => s.order);
  const error = useLicense((s) => s.error);
  const busy = useLicense((s) => s.busy);
  const loadPlans = useLicense((s) => s.loadPlans);
  const start = useLicense((s) => s.startCheckout);
  const openPage = useLicense((s) => s.openCheckoutPage);
  const cancel = useLicense((s) => s.cancelCheckout);
  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);
  const now = useNow(checkout !== null && isBrowserOrder(checkout) && !orderFinished(order) ? checkout.expiresAt : null);
  return (
    <UpgradeView
      lang={lang}
      view={view}
      plans={plans}
      checkout={checkout}
      order={order}
      error={error}
      busy={busy}
      now={now}
      onStart={(plan, email, consent, renew, currency) => void start(plan, email, consent, renew, currency)}
      onOpenPage={() => void openPage()}
      onCancel={() => void cancel()}
    />
  );
}

// Thời gian chờ lớn nhất của `setTimeout` (2^31 − 1 ms).
const MAX_DELAY_MS = 2_147_483_647;

// Giờ hiện tại (giây Unix) lúc vẽ, và vẽ lại ngay sau `deadline` (giờ hẹn trả của đơn thẻ đang chờ): câu trạng thái đổi sang
// "đã quá giờ hẹn trả" mà không chờ sự kiện kế tiếp của luồng hỏi nền (sau hạn chỉ hỏi mỗi 30 giây; vừa mở lại app thì luồng
// hỏi nền đã chạy trước khi màn hình nghe nên có thể chưa có sự kiện nào).
function useNow(deadline: number | null): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (deadline === null) return;
    const ms = deadline * 1000 - Date.now();
    if (ms < 0) return;
    const timer = setTimeout(() => setTick((n) => n + 1), Math.min(ms + 1000, MAX_DELAY_MS));
    return () => clearTimeout(timer);
  }, [deadline, tick]);
  return Date.now() / 1000;
}
