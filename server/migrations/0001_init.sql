-- Schema của license server (spec §6.8, §10.1, §10.2).
-- Mọi thời điểm là giây Unix (UTC). Chỉ lưu dữ liệu §10.1 cho phép:
-- email, đơn hàng, license, mã băm ID máy, device_label, lần kiểm tra gần nhất.

CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  license_key TEXT NOT NULL UNIQUE,      -- 28 ký tự Crockford base32, không gạch nối
  email TEXT,                            -- NULL sau khi ẩn danh theo email (Q9)
  plan TEXT NOT NULL CHECK (plan IN ('pro', 'pro_x2', 'pro_x5')),  -- mã gói (src/plans.ts)
  expires_at INTEGER NOT NULL,
  cycle_anchor INTEGER NOT NULL,         -- mốc chu kỳ hạn mức 30 ngày (§6.8); đổi gói thì đặt lại
  anchor_applied_at INTEGER NOT NULL,    -- lúc server đặt cycle_anchor gần nhất (lúc xử lý đơn); mốc của quota_fresh (QĐ35)
  version INTEGER NOT NULL DEFAULT 0,    -- tăng mỗi lần đổi plan, expires_at hoặc cycle_anchor (QĐ32)
  last_order_code INTEGER,               -- đơn gần nhất đã áp vào license (QĐ32)
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  locked_at INTEGER,                     -- khóa tạm vì gỡ rồi kích hoạt quá ngưỡng (§10.2)
  lock_cleared_at INTEGER                -- admin mở khóa; lần gỡ trước mốc này không tính nữa
);
CREATE INDEX licenses_email ON licenses (email);

CREATE TABLE orders (
  order_code INTEGER PRIMARY KEY AUTOINCREMENT,
  order_token_hash TEXT NOT NULL,        -- SHA-256 của order_token; không lưu token gốc
  provider TEXT NOT NULL,                -- 'payos'
  provider_ref TEXT,                     -- paymentLinkId của PayOS
  plan TEXT NOT NULL CHECK (plan IN ('pro', 'pro_x2', 'pro_x5')),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,                -- 'VND'
  email TEXT,                            -- NULL sau khi ẩn danh theo email (Q9)
  email_consent_at INTEGER NOT NULL,     -- lúc người mua tick đồng ý xử lý email (§10.1)
  renew_license_id TEXT REFERENCES licenses (id),
  license_id TEXT REFERENCES licenses (id),
  grant_kind TEXT,                       -- lúc cấp: 'new' | 'extend' (cùng gói) | 'change' (đổi gói), QĐ32
  status TEXT NOT NULL,                  -- pending | processing | paid | underpaid | cancelled | expired | failed
                                         -- | paid_needs_review (license đã thu hồi nhận được tiền, QĐ37) | refunded (admin ghi đã hoàn)
  amount_paid INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,           -- hạn của link thanh toán (tạo đơn + 15 phút)
  paid_at INTEGER,                       -- lúc server xác nhận đã trả tiền (thời điểm thanh toán của cổng: audit_log, QĐ33)
  last_checked_at INTEGER,
  email_sent_at INTEGER,
  email_attempts INTEGER NOT NULL DEFAULT 0,   -- số lần đã thử gửi thư chứa key
  email_retry_at INTEGER,                      -- lần gửi lại kế tiếp sau lỗi tạm (401, 403, 409, 429, 5xx, mạng)
  email_gave_up_at INTEGER                     -- thôi gửi sau lỗi vĩnh viễn (400, 422)
);
CREATE INDEX orders_pending ON orders (status, created_at);
CREATE INDEX orders_email ON orders (email);

-- Mỗi (license, máy) có đúng một dòng, giữ mãi: gỡ máy chỉ đặt deactivated_at; kích hoạt lại cùng máy
-- dùng lại dòng đó, giữ activation_id, created_at và quota_epoch (QĐ35).
CREATE TABLE activations (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses (id),
  device_id_hash TEXT NOT NULL,          -- SHA-256 hex của IOPlatformUUID hoặc MachineGuid
  device_label TEXT,                     -- tên máy; NULL sau khi ẩn danh (Q9)
  quota_epoch INTEGER NOT NULL DEFAULT 0,    -- admin tăng để máy bắt đầu bộ đếm hạn mức mới (QĐ35)
  epoch_pending INTEGER NOT NULL DEFAULT 0,  -- 1: admin vừa tăng quota_epoch, token kế tiếp mở cửa sổ quota_fresh (QĐ35)
  epoch_window_start INTEGER,                -- lúc cấp token đầu tiên sau lần tăng quota_epoch gần nhất (QĐ35)
  created_at INTEGER NOT NULL,
  last_validated_at INTEGER NOT NULL,
  deactivated_at INTEGER,                -- NULL là đang kích hoạt
  deactivated_by TEXT                    -- 'user' | 'admin', của lần gỡ gần nhất
);
CREATE UNIQUE INDEX activations_device ON activations (license_id, device_id_hash);
CREATE INDEX activations_license ON activations (license_id, deactivated_at);

-- Mọi lần gỡ máy, để đếm luật khóa tạm (§10.2) kể cả khi dòng activation đã được kích hoạt lại.
CREATE TABLE deactivations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL REFERENCES licenses (id),
  activation_id TEXT NOT NULL REFERENCES activations (id),
  at INTEGER NOT NULL,
  by TEXT NOT NULL                       -- 'user' (tự gỡ, gỡ từ xa) | 'admin' (không tính vào luật khóa tạm)
);
CREATE INDEX deactivations_license ON deactivations (license_id, at);

-- Nhật ký mọi thay đổi license và mọi thao tác admin (§6.8, §10.2).
-- detail là JSON, không chứa key đầy đủ, token, email hay khóa API.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,                   -- 'api' | 'webhook' | 'reconcile' | 'admin:<email người vận hành>'
  action TEXT NOT NULL,
  license_id TEXT,
  order_code INTEGER,
  detail TEXT
);
CREATE INDEX audit_license ON audit_log (license_id, at);
CREATE INDEX audit_order ON audit_log (order_code, at);

-- Bộ đếm giới hạn tần suất theo cửa sổ 1 giờ (§10.2). bucket = '<tên>:<HMAC-SHA256(RATE_LIMIT_PEPPER, IP, key hoặc email)>'.
CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
) WITHOUT ROWID;

-- Cảnh báo cho người vận hành (§10.2): đếm theo loại và theo giờ; cron gửi tối đa một email mỗi loại mỗi giờ.
CREATE TABLE ops_alerts (
  kind TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  notified_count INTEGER NOT NULL DEFAULT 0,   -- số sự kiện đã báo; count > notified_count là còn chưa báo
  notified_at INTEGER,
  PRIMARY KEY (kind, window_start)
) WITHOUT ROWID;
