-- Thư nhắc gia hạn trước 3 ngày (spec 2026-11-02-nhac-gia-han-qua-email-design.md).
-- Chỉ THÊM hai bảng và một index; không đụng bảng nào đang có. Worker cũ không đọc các bảng này nên chạy đúng trên schema
-- mới: áp migration trước khi deploy Worker mới (docs/release/phat-hanh.md, mục 17).
-- Không có REFERENCES tới licenses: thư nhắc không được làm hỏng việc xóa hay ẩn danh license.

-- Mỗi (license, mốc hạn) có đúng một dòng: gia hạn xong thì hạn đổi, lần hết hạn kế tiếp là một dòng mới.
-- Dòng này không chứa email; lúc gửi mới tra email từ licenses, nên "ẩn danh theo email" (spec gốc §10.1) không phải dọn thêm bảng này.
CREATE TABLE expiry_reminders (
  license_id TEXT NOT NULL,
  cycle INTEGER NOT NULL,                -- licenses.expires_at lúc xếp lịch (giây Unix)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'gave_up')),
  skip_reason TEXT,                      -- lý do bỏ qua khi status = 'skipped'
  attempts INTEGER NOT NULL DEFAULT 0,   -- số lần đã thử gửi
  retry_at INTEGER,                      -- đang gửi hay hẹn gửi lại: không ai khác gửi trước mốc này
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  PRIMARY KEY (license_id, cycle)
) WITHOUT ROWID;
CREATE INDEX expiry_reminders_pending ON expiry_reminders (status, created_at);

-- Email đã bấm "Ngừng nhận thư nhắc gia hạn". Lưu SHA-256 của email viết thường, không lưu email, để lời từ chối còn nguyên
-- sau khi email bị ẩn danh. Chỉ chặn thư nhắc gia hạn; thư key và thư giao dịch khác không bị ảnh hưởng.
CREATE TABLE reminder_optouts (
  email_hash TEXT PRIMARY KEY,
  at INTEGER NOT NULL
) WITHOUT ROWID;

-- Cron quét license sắp hết hạn mỗi 5 phút: cần index theo hạn.
CREATE INDEX licenses_expires ON licenses (expires_at) WHERE revoked_at IS NULL;
