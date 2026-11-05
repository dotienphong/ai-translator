-- Tự động gia hạn cho thẻ quốc tế qua Creem (spec 2026-11-05-creem-tu-dong-gia-han-design.md §2).
-- Chỉ THÊM một cột (có mặc định) và một bảng; không dựng lại bảng nào. Worker cũ không đọc chúng nên chạy đúng trên schema mới:
-- áp migration TRƯỚC khi deploy Worker mới (docs/release/phat-hanh.md, mục 18).

-- 1: khách đã đồng ý tự gia hạn lúc tạo đơn (đơn thuê bao). 0: đơn trả trước một lần (mọi đơn cũ, đơn PayOS, đơn của app cũ).
ALTER TABLE orders ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0, 1));

-- Mỗi thuê bao của Creem (sub_…) gắn với đúng một license. Không có REFERENCES: xóa hay ẩn danh license không bị chặn bởi bảng này.
CREATE TABLE subscriptions (
  provider_ref TEXT PRIMARY KEY,         -- mã thuê bao ở Creem (sub_…)
  license_id TEXT NOT NULL,
  plan TEXT NOT NULL,                    -- gói của thuê bao (monthly | six_months | yearly)
  customer_ref TEXT,                     -- mã khách ở Creem (cust_…), để tạo link cổng khách hàng
  status TEXT NOT NULL,                  -- active | scheduled_cancel | canceled | past_due | unpaid | paused | expired | trialing
  paid_through INTEGER NOT NULL,         -- hết kỳ Creem đã thu tiền (giây Unix); khóa chống trùng kỳ
  last_event_at INTEGER NOT NULL,        -- giờ (giây) của sự kiện mới nhất đã áp; sự kiện cũ hơn không đổi trạng thái
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX subscriptions_license ON subscriptions (license_id);

-- Mỗi kỳ thuê bao một đơn gia hạn: provider_ref của đơn gia hạn là "<mã thuê bao>@<hết kỳ>" (tất định), nên webhook gửi lại hay chạy
-- chồng không tạo được hai đơn cho cùng một kỳ. Đơn kỳ đầu mang mã phiên (ch_…), cũng duy nhất. Index một phần: đơn một lần và đơn
-- PayOS không bị ràng buộc.
CREATE UNIQUE INDEX orders_subscription_ref ON orders (provider_ref) WHERE auto_renew = 1 AND provider_ref IS NOT NULL;
