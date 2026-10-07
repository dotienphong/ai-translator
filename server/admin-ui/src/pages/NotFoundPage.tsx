import { Link } from "../router";

export function NotFoundPage() {
  return (
    <>
      <h1>Không có trang này</h1>
      <p>
        <Link to="/">Về Việc cần xử lý</Link>
      </p>
    </>
  );
}
