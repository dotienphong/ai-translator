import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

// Ranh giới lỗi nhỏ (spec 2026-11-05-dang-nhap-google; quy tắc "app không bao giờ sập"): phần con ném lỗi lúc vẽ thì chỉ phần đó
// thành một câu báo nhỏ kèm nút Thử lại, phần còn lại của cửa sổ (thanh điều hướng, các màn khác) vẫn dùng được. Thử lại dựng
// lại phần con từ đầu (khóa mới). Chữ do nơi dùng truyền vào, để component không phụ thuộc store.
export interface SafeBoundaryProps {
  message: string;
  retry: string;
  children?: ReactNode;
}

interface SafeBoundaryState {
  failed: boolean;
  attempt: number;
}

export class SafeBoundary extends Component<SafeBoundaryProps, SafeBoundaryState> {
  override state: SafeBoundaryState = { failed: false, attempt: 0 };

  static getDerivedStateFromError(_error: unknown): Partial<SafeBoundaryState> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    try {
      console.error("lỗi khi vẽ giao diện", error, info.componentStack);
    } catch {
      // Ghi log hỏng: không có gì để làm thêm.
    }
  }

  override render() {
    if (this.state.failed) {
      return (
        <div className="safe-boundary" role="alert">
          <p className="note error">{this.props.message}</p>
          <div className="actions">
            <button onClick={() => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))}>{this.props.retry}</button>
          </div>
        </div>
      );
    }
    return <Fragment key={String(this.state.attempt)}>{this.props.children}</Fragment>;
  }
}
