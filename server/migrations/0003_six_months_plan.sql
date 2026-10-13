-- Gói 6 Months (spec 2026-10-13): mã gói thứ ba 'six_months' cùng 'monthly' và 'yearly'. Chỉ NỚI ràng buộc CHECK của
-- licenses.plan và orders.plan; mọi dòng dữ liệu giữ nguyên giá trị (không đổi mã nào). Mã gói lạ trong dữ liệu cũ vẫn làm
-- CHECK của bảng mới từ chối và migration dừng, như 0002 (không gộp nhầm gói).
--
-- SQLite không sửa được CHECK, nên dựng lại bảng đúng khuôn 0002 (đã chạy trên production, spec 2026-10-07 §5.1): licenses là
-- bảng cha của activations, deactivations và orders, nên dựng lại cả bốn bảng:
--   1. tạo licenses_new, rồi các bảng con *_new trỏ tới licenses_new / activations_new; chép dữ liệu;
--   2. xóa bảng cũ theo thứ tự con trước cha (không còn bảng nào trỏ tới bảng đang xóa);
--   3. đổi tên *_new về tên cũ: SQLite tự sửa REFERENCES của các bảng con theo tên mới;
--   4. tạo lại index; giữ bộ đếm AUTOINCREMENT của orders và deactivations.
-- Schema sau 0003 giống hệt sau 0002, chỉ khác chuỗi CHECK (test/migrations.test.ts so sánh).
-- Worker cũ (chỉ ghi 'monthly', 'yearly') vẫn chạy đúng trên schema mới, nên áp migration này TRƯỚC khi deploy Worker mới.
-- Bộ đếm số đơn của orders không bao giờ lùi: PayOS nhớ mọi orderCode đã dùng và từ chối mã trùng.

CREATE TABLE licenses_new (
  id TEXT PRIMARY KEY,
  license_key TEXT NOT NULL UNIQUE,      -- 28 ký tự Crockford base32, không gạch nối
  email TEXT,                            -- NULL sau khi ẩn danh theo email (Q9)
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'six_months', 'yearly')),  -- mã gói (src/token.ts PLAN_CODES)
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
INSERT INTO licenses_new (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, version,
                          last_order_code, created_at, revoked_at, locked_at, lock_cleared_at)
  SELECT id, license_key, email, plan, expires_at, cycle_anchor,
         anchor_applied_at, version, last_order_code, created_at, revoked_at, locked_at, lock_cleared_at
  FROM licenses;

CREATE TABLE orders_new (
  order_code INTEGER PRIMARY KEY AUTOINCREMENT,
  order_token_hash TEXT NOT NULL,        -- SHA-256 của order_token; không lưu token gốc
  provider TEXT NOT NULL,                -- 'payos'
  provider_ref TEXT,                     -- paymentLinkId của PayOS
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'six_months', 'yearly')),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,                -- 'VND'
  email TEXT,                            -- NULL sau khi ẩn danh theo email (Q9)
  email_consent_at INTEGER NOT NULL,     -- lúc người mua tick đồng ý xử lý email (§10.1)
  renew_license_id TEXT REFERENCES licenses_new (id),
  license_id TEXT REFERENCES licenses_new (id),
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
  email_retry_at INTEGER,                      -- lần gửi lại kế tiếp sau lỗi tạm (401, 403, 409 concurrent_…, 429, 5xx, mạng)
  email_gave_up_at INTEGER                     -- thôi gửi sau lỗi vĩnh viễn (400, 422)
);
INSERT INTO orders_new (order_code, order_token_hash, provider, provider_ref, plan, amount, currency, email,
                        email_consent_at, renew_license_id, license_id, grant_kind, status, amount_paid, created_at,
                        expires_at, paid_at, last_checked_at, email_sent_at, email_attempts, email_retry_at,
                        email_gave_up_at)
  SELECT order_code, order_token_hash, provider, provider_ref, plan,
         amount, currency, email, email_consent_at, renew_license_id, license_id, grant_kind, status, amount_paid,
         created_at, expires_at, paid_at, last_checked_at, email_sent_at, email_attempts, email_retry_at,
         email_gave_up_at
  FROM orders;

-- Mỗi (license, máy) có đúng một dòng, giữ mãi: gỡ máy chỉ đặt deactivated_at; kích hoạt lại cùng máy
-- dùng lại dòng đó, giữ activation_id, created_at và quota_epoch (QĐ35).
CREATE TABLE activations_new (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses_new (id),
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
INSERT INTO activations_new (id, license_id, device_id_hash, device_label, quota_epoch, epoch_pending,
                             epoch_window_start, created_at, last_validated_at, deactivated_at, deactivated_by)
  SELECT id, license_id, device_id_hash, device_label, quota_epoch, epoch_pending, epoch_window_start, created_at,
         last_validated_at, deactivated_at, deactivated_by
  FROM activations;

-- Mọi lần gỡ máy, để đếm luật khóa tạm (§10.2) kể cả khi dòng activation đã được kích hoạt lại.
CREATE TABLE deactivations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL REFERENCES licenses_new (id),
  activation_id TEXT NOT NULL REFERENCES activations_new (id),
  at INTEGER NOT NULL,
  by TEXT NOT NULL                       -- 'user' (tự gỡ, gỡ từ xa) | 'admin' (không tính vào luật khóa tạm)
);
INSERT INTO deactivations_new (id, license_id, activation_id, at, by)
  SELECT id, license_id, activation_id, at, by FROM deactivations;

-- Giữ bộ đếm AUTOINCREMENT (orders: production bắt đầu từ 1.000.001, §6.8): số kế tiếp không bao giờ lùi,
-- kể cả khi bộ đếm lớn hơn khóa lớn nhất còn lại.
DELETE FROM sqlite_sequence WHERE name IN ('orders_new', 'deactivations_new');
INSERT INTO sqlite_sequence (name, seq)
  SELECT name || '_new', seq FROM sqlite_sequence WHERE name IN ('orders', 'deactivations');

DROP TABLE deactivations;
DROP TABLE activations;
DROP TABLE orders;
DROP TABLE licenses;
ALTER TABLE licenses_new RENAME TO licenses;
ALTER TABLE activations_new RENAME TO activations;
ALTER TABLE deactivations_new RENAME TO deactivations;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX licenses_email ON licenses (email);
CREATE INDEX orders_pending ON orders (status, created_at);
CREATE INDEX orders_email ON orders (email);
CREATE UNIQUE INDEX activations_device ON activations (license_id, device_id_hash);
CREATE INDEX activations_license ON activations (license_id, deactivated_at);
CREATE INDEX deactivations_license ON deactivations (license_id, at);
