// Công cụ (spec Web Admin §4.2): ký thử khóa dự phòng, xác nhận webhook PayOS, ẩn danh theo email.
import { useState } from "react";
import { api } from "../api/endpoints";
import type { KeyCheck } from "../api/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Notice } from "../components/Feedback";
import { CopyButton } from "../components/MaskedKey";

const WEBHOOK_URL = "https://api.aitranslator.io.vn/v1/webhooks/payos";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Dialog = "sign" | "webhook" | "erase" | null;

export function ToolsPage() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [signed, setSigned] = useState<KeyCheck | null>(null);
  const [url, setUrl] = useState(WEBHOOK_URL);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const close = () => setDialog(null);
  const signedJson = signed ? JSON.stringify(signed) : "";
  return (
    <>
      <h1>Công cụ</h1>
      {notice && <Notice text={notice} onClose={() => setNotice(null)} />}

      <section className="card">
        <h2>Ký thử bằng khóa dự phòng</h2>
        <p className="muted">
          Worker API ký một token bằng khóa dự phòng. Kiểm token bằng <code>scripts/verify-token.mjs</code>. Token không dùng được làm bản quyền.
        </p>
        <button type="button" onClick={() => setDialog("sign")}>
          Ký thử…
        </button>
        {signed && (
          <>
            <p>
              Ô <code>{signed.slot}</code>, kid <code>{signed.kid}</code> <CopyButton text={signedJson} />
            </p>
            <pre className="json">{signedJson}</pre>
            <p className="muted">
              Chép khối trên rồi chạy trong <code>server/</code>: <code>pbpaste | node scripts/verify-token.mjs production</code>
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Xác nhận webhook PayOS</h2>
        <p className="muted">Đăng ký lại URL webhook với PayOS. Chỉ nhận URL trên đúng Worker API (API_ORIGIN).</p>
        <label className="field">
          URL webhook
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <button type="button" onClick={() => setDialog("webhook")}>
          Xác nhận…
        </button>
      </section>

      <section className="card">
        <h2>Ẩn danh dữ liệu theo email</h2>
        <p className="muted">
          Khi khách yêu cầu xóa dữ liệu: bỏ email và tên máy, giữ số liệu kế toán. License vẫn dùng được nhưng không khôi phục được qua email nữa.
        </p>
        <label className="field">
          Email của khách
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </label>
        <button type="button" className="danger" disabled={!EMAIL.test(email.trim())} onClick={() => setDialog("erase")}>
          Ẩn danh…
        </button>
      </section>

      {dialog === "sign" && (
        <ConfirmDialog
          title="Ký thử bằng khóa dự phòng?"
          description="Worker API ký một token thử. Không đổi dữ liệu nào."
          confirmLabel="Ký thử"
          needsNote={false}
          onConfirm={async () => setSigned(await api.testSign())}
          onClose={close}
        />
      )}
      {dialog === "webhook" && (
        <ConfirmDialog
          title="Đăng ký webhook với PayOS?"
          description={`PayOS sẽ gửi webhook tới ${url}.`}
          confirmLabel="Xác nhận"
          needsNote={false}
          onConfirm={async () => {
            const r = await api.confirmWebhook(url.trim());
            setNotice(`Đã đăng ký webhook: ${r.webhook_url}`);
          }}
          onClose={close}
        />
      )}
      {dialog === "erase" && (
        <ConfirmDialog
          title={`Ẩn danh dữ liệu của ${email.trim()}?`}
          description="Bỏ email khỏi mọi đơn và license, bỏ tên máy. Không hoàn tác được."
          confirmLabel="Ẩn danh"
          needsNote
          typeToConfirm="AN DANH"
          onConfirm={async (note) => {
            const r = await api.erase(email.trim(), note);
            setNotice(`Đã ẩn danh: ${r.orders} đơn, ${r.licenses} license, ${r.activations} máy.`);
            setEmail("");
          }}
          onClose={close}
        />
      )}
    </>
  );
}
