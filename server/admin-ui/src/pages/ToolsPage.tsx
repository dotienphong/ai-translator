// Công cụ (spec Web Admin §4.2; giao diện mới mục 2): lưới thẻ (ký thử khóa dự phòng, xác nhận webhook PayOS) và thẻ Khu
// vực nguy hiểm riêng cho ẩn danh theo email. Kết quả của mỗi công cụ hiện ngay trong thẻ của nó. Nút mở hộp xác nhận bị
// khóa khi ô nhập chưa hợp lệ, có câu giải thích dưới ô.
import { type ReactNode, useRef, useState } from "react";
import { api } from "../api/endpoints";
import type { KeyCheck } from "../api/types";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { ResultRegion } from "../components/Feedback";
import { Field } from "../components/Field";
import { IconCheckCircle, IconCoins, IconKey, IconUser, IconWarning } from "../components/icons";
import { KeyValue } from "../components/KeyValue";
import { PageHeader } from "../components/PageHeader";
import { fmtHm, nowSec } from "../format";

const WEBHOOK_URL = "https://api.aitranslator.io.vn/v1/webhooks/payos";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Dialog = "sign" | "webhook" | "erase" | null;

/** URL https đầy đủ (server còn kiểm URL phải nằm trên đúng Worker API). */
function httpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Kết quả của một công cụ: dấu kiểm, câu kết quả, giờ chạy. Nằm trong ResultRegion (vùng live có sẵn của thẻ): kết quả mới
 * thì được đọc, cuộn tới và nhận focus (tabIndex -1).
 */
function Result({ at, children }: { at: number; children: ReactNode }) {
  return (
    <div className="tool-result" tabIndex={-1}>
      <IconCheckCircle size={18} />
      <div className="tool-result-body">{children}</div>
      <span className="tool-result-at">lúc {fmtHm(at)}</span>
    </div>
  );
}

export function ToolsPage() {
  const [dialog, setDialog] = useState<Dialog>(null);
  // seq: số thứ tự của lần chạy (hai lần trong cùng một giây vẫn là kết quả mới: được đọc, cuộn tới, nhận focus).
  const [signed, setSigned] = useState<{ seq: number; at: number; r: KeyCheck } | null>(null);
  const [hooked, setHooked] = useState<{ seq: number; at: number; url: string } | null>(null);
  const [erased, setErased] = useState<{ seq: number; at: number; text: string } | null>(null);
  const runs = useRef(0);
  const next = () => ++runs.current;
  const [url, setUrl] = useState(WEBHOOK_URL);
  const [urlTouched, setUrlTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const close = () => setDialog(null);
  const signedJson = signed ? JSON.stringify(signed.r) : "";
  const urlOk = httpsUrl(url.trim());
  const emailOk = EMAIL.test(email.trim());
  const urlError = urlTouched && !urlOk ? "Cần một URL https đầy đủ, ví dụ " + WEBHOOK_URL : undefined;
  const emailError = emailTouched && email.trim() !== "" && !emailOk ? "Email chưa đúng dạng (ví dụ ten@example.com)." : undefined;

  return (
    <>
      <PageHeader title="Công cụ" description="Thao tác bảo trì ít dùng. Mỗi lần chạy đều ghi vào Nhật ký." />

      <div className="tools-grid">
        <Card
          title="Ký thử bằng khóa dự phòng"
          icon={<IconKey size={18} />}
          description="Worker API ký một token thử bằng khóa dự phòng, để chắc khóa còn dùng được. Token không dùng được làm bản quyền."
          className="tool-card"
        >
          <div className="tool-actions">
            <Button onClick={() => setDialog("sign")}>Ký thử…</Button>
          </div>
          <ResultRegion resultKey={signed?.seq ?? null}>
            {signed && (
              <Result at={signed.at}>
                <KeyValue
                  items={[
                    { label: "Ô khóa", value: signed.r.slot, mono: true },
                    { label: "kid", value: signed.r.kid, mono: true, copy: signed.r.kid, copyWhat: "kid" },
                  ]}
                />
                <div className="code-block">
                  <pre>{signedJson}</pre>
                  <CopyButton text={signedJson} label="Chép JSON" />
                </div>
                <div className="tool-hint">
                  <span>
                    Kiểm token: chép khối trên rồi chạy trong <code>server/</code>
                  </span>
                  <code className="cmd">pbpaste | node scripts/verify-token.mjs production</code>
                </div>
              </Result>
            )}
          </ResultRegion>
        </Card>

        <Card
          title="Xác nhận webhook PayOS"
          icon={<IconCoins size={18} />}
          description="Đăng ký lại URL webhook với PayOS. Chỉ nhận URL trên đúng Worker API (API_ORIGIN)."
          className="tool-card"
        >
          <Field label="URL webhook" hint="Mặc định là URL webhook của Worker API production." error={urlError}>
            <input
              type="url"
              value={url}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={urlError ? true : undefined}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => setUrlTouched(true)}
            />
          </Field>
          <div className="tool-actions">
            <Button disabled={!urlOk} onClick={() => setDialog("webhook")}>
              Xác nhận…
            </Button>
            {!urlOk && !urlError && <span className="tool-why">Nhập URL https để bật nút.</span>}
          </div>
          <ResultRegion resultKey={hooked?.seq ?? null}>
            {hooked && (
              <Result at={hooked.at}>
                <span className="tool-result-text">{`Đã đăng ký webhook: ${hooked.url}`}</span>
              </Result>
            )}
          </ResultRegion>
        </Card>
      </div>

      <Card
        tone="danger"
        icon={<IconWarning size={18} />}
        title="Khu vực nguy hiểm"
        description="Không hoàn tác được. Mỗi lần chạy ghi vào Nhật ký cùng lý do."
        className="danger-zone tools-danger"
      >
        <div className="danger-item is-form">
          <div className="danger-text">
            <p className="danger-name">
              <IconUser size={16} /> Ẩn danh dữ liệu theo email
            </p>
            <p className="danger-effect">
              Khi khách yêu cầu xóa dữ liệu: bỏ email khỏi mọi đơn và license, bỏ tên máy, giữ số liệu kế toán. License vẫn dùng được nhưng không
              khôi phục được qua email nữa.
            </p>
          </div>
          <div className="danger-form">
            <Field label="Email của khách" hint="Nút Ẩn danh bật khi email đúng dạng." error={emailError}>
              <input
                type="email"
                value={email}
                autoComplete="off"
                spellCheck={false}
                placeholder="ten@example.com"
                aria-invalid={emailError ? true : undefined}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
              />
            </Field>
            <Button variant="danger" disabled={!emailOk} onClick={() => setDialog("erase")}>
              Ẩn danh…
            </Button>
          </div>
        </div>
        <ResultRegion resultKey={erased?.seq ?? null}>
          {erased && (
            <Result at={erased.at}>
              <span className="tool-result-text">{erased.text}</span>
            </Result>
          )}
        </ResultRegion>
      </Card>

      {dialog === "sign" && (
        <ConfirmDialog
          title="Ký thử bằng khóa dự phòng?"
          description="Worker API ký một token thử. Không đổi dữ liệu nào."
          confirmLabel="Ký thử"
          needsNote={false}
          onConfirm={async () => {
            const r = await api.testSign();
            setSigned({ seq: next(), at: nowSec(), r });
          }}
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
            setHooked({ seq: next(), at: nowSec(), url: r.webhook_url });
          }}
          onClose={close}
        />
      )}
      {dialog === "erase" && (
        <ConfirmDialog
          title={`Ẩn danh dữ liệu của ${email.trim()}?`}
          description="Bỏ email khỏi mọi đơn và license, bỏ tên máy. Không hoàn tác được. Lý do được ghi vào nhật ký: không ghi email hay thông tin cá nhân của khách vào đây."
          confirmLabel="Ẩn danh"
          needsNote
          typeToConfirm="AN DANH"
          onConfirm={async (note) => {
            const r = await api.erase(email.trim(), note);
            setErased({ seq: next(), at: nowSec(), text: `Đã ẩn danh: ${r.orders} đơn, ${r.licenses} license, ${r.activations} máy.` });
            setEmail("");
            setEmailTouched(false);
          }}
          onClose={close}
        />
      )}
    </>
  );
}
