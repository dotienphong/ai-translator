import { useApp, useT } from "../appStore";

// Giới thiệu (§4.3): phiên bản, thư mục log (Đ10), câu miễn trừ nhãn hiệu (§10.1).
// Kế hoạch 07 thêm danh sách giấy phép sinh từ `THIRD_PARTY_NOTICES`.
export function About() {
  const t = useT();
  const info = useApp((s) => s.info);
  const openLogDir = useApp((s) => s.openLogDir);
  if (!info) return null;
  return (
    <>
      <div className="card">
        <h2>{info.name}</h2>
        <p>{t("about.version", { version: info.version })}</p>
        <div className="row">
          <button onClick={() => void openLogDir()}>{t("about.openLogs")}</button>
        </div>
        <p className="hint">{t("about.logsHint")}</p>
      </div>
      <div className="card">
        <h2>{t("about.licenses")}</h2>
        <p className="hint">{t("about.licensesPending")}</p>
      </div>
      <p className="hint">{t("about.trademark")}</p>
    </>
  );
}
