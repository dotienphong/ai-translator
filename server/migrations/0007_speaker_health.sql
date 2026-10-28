-- Báo cáo tình trạng bộ đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.2). Chỉ THÊM một bảng và hai index; không đổi bảng nào
-- đã có. Không có tên người, không có chữ: chỉ phiên bản, trạng thái, số phút và mô tả chỉ báo tự học (vai trò, vị trí, lớp), mọi
-- trường đã qua danh sách cho phép ở src/speaker-health.ts.
-- Giữ 60 ngày (cron */5 dọn: pruneSpeakerHealth). Mỗi (máy, ngày, app họp, phiên bản app họp, canary) một dòng: app gửi lại sau lỗi
-- mạng không tạo bản trùng. `canary = 1` là kết quả của kiểm tra tự động hằng ngày (spec §7.3), không phải của người dùng.
-- Worker cũ không biết bảng này nên chạy đúng trên schema mới: áp migration này TRƯỚC khi deploy Worker mới.

CREATE TABLE speaker_health (
  device_id_hash TEXT NOT NULL,          -- cùng giá trị với error_reports, trials, activations; xóa theo email dùng nó
  day TEXT NOT NULL,                     -- 'YYYY-MM-DD' (UTC) của số liệu
  meeting_app TEXT NOT NULL CHECK (meeting_app IN ('teams', 'zoom', 'meet_chrome', 'meet_edge')),
  meeting_version TEXT NOT NULL,         -- phiên bản app họp; '?' khi app không đọc được
  canary INTEGER NOT NULL CHECK (canary IN (0, 1)),
  received_at INTEGER NOT NULL,          -- giờ server (giây Unix)
  build TEXT NOT NULL CHECK (build IN ('release', 'debug')),
  app_version TEXT NOT NULL,             -- phiên bản AI Translator
  os_name TEXT NOT NULL,
  os_version TEXT NOT NULL,
  arch TEXT NOT NULL,
  recipe_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ok', 'no_names', 'no_speaking', 'no_permission', 'blocked')),
  minutes_ok INTEGER NOT NULL,
  minutes_total INTEGER NOT NULL,
  learned INTEGER NOT NULL,
  patterns TEXT NOT NULL,                -- JSON mảng mẫu chỉ báo tự học (không tên người); '[]' nếu không có
  PRIMARY KEY (device_id_hash, day, meeting_app, meeting_version, canary)
) WITHOUT ROWID;
CREATE INDEX speaker_health_received ON speaker_health (received_at);
CREATE INDEX speaker_health_app ON speaker_health (meeting_app, meeting_version, day);
