import type { ApiError } from "../api/client";

export function ErrorBox({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>{error.message}</span>
      {onRetry && error.code !== "session_expired" && (
        <button type="button" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export function Notice({ text, onClose }: { text: string; onClose(): void }) {
  return (
    <div className="notice" role="status">
      <span>{text}</span>
      <button type="button" className="link" onClick={onClose}>
        Đóng
      </button>
    </div>
  );
}
