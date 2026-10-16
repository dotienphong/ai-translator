// Khung bắt lỗi vẽ (spec Web Admin: lệch hợp đồng với server không được làm trắng cả trang). Một thành phần con ném lỗi khi
// vẽ (hay trong effect) thì React gỡ cả cây phía trên; khung này giữ phần còn lại và hiện hộp lỗi có nút Tải lại trang.
// Dùng hai chỗ trong App.tsx: bọc riêng nội dung trang (thanh bên và thanh trên còn nguyên, đổi trang là hết lỗi vì vùng nội
// dung đặt key theo địa chỉ) và bọc cả khung App (`whole`: lỗi ngoài nội dung trang thì hộp lỗi đứng một mình).
import { Component, type ReactNode } from "react";
import { Button } from "./Button";
import { IconAlert } from "./icons";

interface Props {
  children: ReactNode;
  /** Bọc cả App: hộp lỗi đứng một mình nên cần vùng nội dung quanh nó (lề, bề rộng). */
  whole?: boolean;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const box = (
      <div className="error-box" role="alert">
        <IconAlert size={20} />
        <div className="feedback-text">
          <strong>Trang lỗi khi hiển thị</strong>
          <span>Dữ liệu nhận về có thể không khớp với bản giao diện đang mở (sau khi cập nhật hay lùi bản). Tải lại trang thường sửa được.</span>
        </div>
        <Button size="sm" onClick={() => window.location.reload()} className="feedback-action">
          Tải lại trang
        </Button>
      </div>
    );
    return this.props.whole ? (
      <main className="main">
        <div className="content">{box}</div>
      </main>
    ) : (
      box
    );
  }
}
