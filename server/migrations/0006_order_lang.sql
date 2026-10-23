-- Email theo ngôn ngữ app (spec 2026-10-23-email-theo-ngon-ngu-design.md §3): ngôn ngữ giao diện app lúc tạo đơn, để thư gửi key
-- (lần đầu và các lần cron gửi lại) viết bằng ngôn ngữ đó, phần tiếng Anh ở dưới. NULL với đơn cũ, đơn của app ≤ 0.2.4 (không gửi
-- `lang`) và đơn đã ẩn danh theo email; khi đó thư đoán theo loại tiền (USD ra tiếng Anh, còn lại tiếng Việt).
-- Chỉ THÊM một cột cho phép NULL, không dựng lại bảng: Worker cũ không đọc cột này nên chạy đúng trên schema mới (áp migration
-- trước khi deploy Worker mới), và bộ đếm số đơn (sqlite_sequence) không bị đụng: PayOS nhớ mọi orderCode đã dùng.
ALTER TABLE orders ADD COLUMN lang TEXT CHECK (lang IN ('vi', 'en', 'ja', 'zh', 'ko'));
