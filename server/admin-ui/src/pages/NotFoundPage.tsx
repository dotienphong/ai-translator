// Trang 404 (spec giao diện mới mục 2: "trang trống, lỗi, 404 thiết kế riêng"): số 404 lớn, câu giải thích, địa chỉ vừa
// mở, hai lối ra (Việc cần xử lý, ô tra cứu) và mẹo phím tắt.
import { Button } from "../components/Button";
import { IconInbox, IconSearch } from "../components/icons";
import { focusSearch } from "../components/SearchBox";

export function NotFoundPage() {
  return (
    <section className="nf" aria-labelledby="nf-title">
      <p className="nf-code" aria-hidden="true">
        404
      </p>
      <h1 id="nf-title" className="nf-title">
        Không có trang này
      </h1>
      <p className="nf-text">
        Địa chỉ <code>{window.location.pathname}</code> không trỏ tới trang nào của Admin: có thể gõ nhầm, hay là liên kết cũ.
      </p>
      <div className="nf-actions">
        <Button to="/" variant="primary" icon={<IconInbox size={18} />}>
          Về Việc cần xử lý
        </Button>
        <Button icon={<IconSearch size={18} />} onClick={focusSearch}>
          Mở ô tra cứu
        </Button>
      </div>
      <p className="nf-tip">
        Tìm đơn, license hay máy: bấm <kbd>/</kbd> ở bất kỳ đâu rồi gõ email, mã đơn, key hay mã máy.
      </p>
    </section>
  );
}
