-- Chat hỗ trợ trên website và app, tin nhắn về Zalo của chủ dự án (spec 2026-10-22-chat-ho-tro-zalo-design.md §2.1).
-- Chỉ THÊM ba bảng và bốn index; không đổi bảng nào đã có, không nối với bảng license.
-- Cuộc chat tự xóa 90 ngày sau lần hoạt động cuối (cron */5: src/support/cron.ts, pruneSupport).
-- Worker cũ không biết các bảng này nên chạy đúng trên schema mới: áp migration này TRƯỚC khi deploy Worker mới.

CREATE TABLE support_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,              -- 3 ký tự hoa, bảng chữ không có 0, 1, I, O; chủ dự án ghi "#MÃ" khi trả lời
  token_hash TEXT NOT NULL UNIQUE,        -- SHA-256 hex của token khách giữ; server không lưu token gốc
  source TEXT NOT NULL CHECK (source IN ('web', 'app', 'app-debug')),
  lang TEXT NOT NULL CHECK (lang IN ('vi', 'en', 'ja', 'zh', 'ko')),
  page TEXT,                              -- đường dẫn trang lúc mở chat (web), không có query
  context TEXT,                           -- dòng thông tin máy (app), chỉ khi khách để tích
  email TEXT,                             -- khách tự để lại; không bao giờ gửi qua Zalo
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'blocked')),
  created_at INTEGER NOT NULL,
  last_customer_at INTEGER,
  last_owner_at INTEGER,
  last_activity_at INTEGER NOT NULL,      -- mốc giữ 90 ngày
  delivered_owner_id INTEGER NOT NULL DEFAULT 0,  -- id lớn nhất của tin chủ dự án khách đã nhận qua khung chat
  emailed_owner_id INTEGER NOT NULL DEFAULT 0,    -- id lớn nhất của tin chủ dự án đã gửi qua email
  emailed_at INTEGER                      -- lần cuối gửi email câu trả lời (tối đa một thư mỗi giờ)
);
CREATE INDEX support_conversations_activity ON support_conversations (last_activity_at);
CREATE INDEX support_conversations_customer ON support_conversations (last_customer_at);

CREATE TABLE support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,   -- tăng dần toàn hệ thống: con trỏ `after` của khách
  conversation_id INTEGER NOT NULL REFERENCES support_conversations (id),
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'owner')),
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  forwarded_at INTEGER,                   -- tin khách: lúc Zalo nhận (hay lúc đang giữ chỗ để gửi)
  forward_attempts INTEGER NOT NULL DEFAULT 0,
  zalo_message_id TEXT UNIQUE             -- tin chủ dự án: message_id của Zalo, chống ghi trùng khi Zalo gửi lại webhook
);
CREATE INDEX support_messages_conversation ON support_messages (conversation_id, id);
CREATE INDEX support_messages_pending ON support_messages (forwarded_at, created_at) WHERE sender = 'customer';

-- Cài đặt của chat: 'enabled' ('1' bật, '0' tắt; chủ dự án đổi bằng /bat, /tat), 'zalo_fail_streak' (số lần cron liền không chuyển được tin).
CREATE TABLE support_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO support_settings (key, value) VALUES ('enabled', '0'), ('zalo_fail_streak', '0');
