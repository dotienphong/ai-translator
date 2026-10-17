-- Báo cáo lỗi gửi từ app (spec 2026-10-17-diagnostics-reports-design.md §3). Chỉ THÊM hai bảng và ba index; không đổi bảng nào đã có.
-- Giữ 30 ngày và tối đa 3.000 báo cáo (cron */5 dọn: src/error-reports.ts, pruneErrorReports). Dữ liệu kỹ thuật tự hết hạn, khác với
-- dữ liệu khách hàng giữ không thời hạn (spec gốc §10.1).
-- Tách hai bảng để trang danh sách của Web Admin chỉ đọc metadata, không đọc phần log lớn.
-- Worker cũ không biết các bảng này nên chạy đúng trên schema mới: áp migration này TRƯỚC khi deploy Worker mới.

CREATE TABLE error_reports (
  id TEXT PRIMARY KEY,                   -- mã báo cáo "R-XXXX-XXXX" do app sinh; người dùng đọc cho hỗ trợ
  received_at INTEGER NOT NULL,          -- giờ server (giây Unix); mốc để giữ 30 ngày
  occurred_at INTEGER NOT NULL,          -- giờ máy lúc xảy ra (app gửi; server đã kiểm lệch tối đa 7 ngày)
  kind TEXT NOT NULL CHECK (kind IN ('crash', 'session_error', 'sidecar_died', 'manual')),
  code TEXT,                             -- mã lỗi; NULL với 'manual'
  fingerprint TEXT NOT NULL,             -- 16 hex; 16 số 0 với 'manual'
  build TEXT NOT NULL CHECK (build IN ('release', 'debug')),
  app_version TEXT NOT NULL,
  os_name TEXT NOT NULL,
  os_version TEXT NOT NULL,
  arch TEXT NOT NULL,
  chip TEXT,
  ram_mb INTEGER,
  gpu_backend TEXT,                      -- 'metal' | 'vulkan' | 'cpu'; kiểm ở src/error-reports.ts (không CHECK để thêm giá trị không cần migration)
  model_pack TEXT,
  plan TEXT,                             -- 'free' | mã gói trả phí; không có key
  ui_lang TEXT NOT NULL,
  device_id_hash TEXT NOT NULL,          -- cùng giá trị với trials và activations; xóa theo email dùng nó để tìm báo cáo của máy
  message TEXT NOT NULL                  -- đã che dữ liệu cá nhân phía app, server kiểm lại
);
CREATE INDEX error_reports_fingerprint ON error_reports (fingerprint, received_at);
CREATE INDEX error_reports_received ON error_reports (received_at);
CREATE INDEX error_reports_device ON error_reports (device_id_hash);

CREATE TABLE error_report_logs (
  id TEXT PRIMARY KEY REFERENCES error_reports (id),
  app_log TEXT NOT NULL,
  asr_log TEXT NOT NULL,
  llama_log TEXT NOT NULL
);
