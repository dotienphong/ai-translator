-- Tài khoản Google và đăng nhập (spec 2026-11-05-dang-nhap-google-design.md §4).
-- Chỉ THÊM hai bảng, hai cột (cho phép NULL) và bốn index; không dựng lại bảng nào, dữ liệu cũ giữ nguyên. Worker cũ không đọc
-- chúng nên chạy đúng trên schema mới: áp migration TRƯỚC khi deploy Worker mới.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,              -- UUID
  google_sub TEXT NOT NULL UNIQUE,  -- định danh ổn định của tài khoản Google (không dùng email làm khóa)
  email TEXT,                       -- NULL sau khi xóa tài khoản hay ẩn danh theo email
  email_verified INTEGER NOT NULL,  -- luôn 1: server từ chối id_token chưa xác minh email
  consent_at INTEGER NOT NULL,      -- lúc người dùng tick đồng ý ở màn đăng nhập (giây Unix)
  lang TEXT,                        -- ngôn ngữ giao diện lúc đăng nhập, để gửi thư đúng ngôn ngữ (như orders.lang)
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  trial_started_at INTEGER,         -- mốc dùng thử của tài khoản (luật mỗi tài khoản một lần, §5.3); NULL là chưa dùng thử
  trial_ends_at INTEGER,            -- giữ nguyên cả khi xóa tài khoản (§5.5)
  deleted_at INTEGER                -- NULL là còn hoạt động
);
CREATE INDEX accounts_email ON accounts (email);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,              -- login_id (UUID), app giữ
  state_hash TEXT NOT NULL,         -- SHA-256 của state gửi cho Google; không lưu state gốc
  nonce_hash TEXT NOT NULL,
  challenge TEXT NOT NULL,          -- challenge của app (bước 1)
  code_verifier TEXT NOT NULL,      -- PKCE phía Worker↔Google, lưu nguyên (không mã hóa); đặt '' ngay khi status rời 'pending'
  device_id_hash TEXT NOT NULL,
  consent_at INTEGER NOT NULL,
  lang TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','done','denied','failed','claimed')),
  account_id TEXT REFERENCES accounts (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL       -- created_at + 10 phút
);
CREATE INDEX login_attempts_expires ON login_attempts (expires_at);

ALTER TABLE trials ADD COLUMN account_id TEXT REFERENCES accounts (id);
ALTER TABLE licenses ADD COLUMN account_id TEXT REFERENCES accounts (id);
CREATE INDEX trials_account ON trials (account_id);
CREATE INDEX licenses_account ON licenses (account_id);
