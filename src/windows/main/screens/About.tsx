import { useState } from "react";
import { useApp, useT } from "../appStore";
import { Licenses } from "./Licenses";
import { DebugPanel } from "../DebugPanel";
import { LegalDetails } from "../LegalDocument";

// Số lần bấm vào dòng phiên bản để mở bảng debug ẩn (§7).
const DEBUG_CLICKS = 5;

// Giới thiệu (§4.3): phiên bản, thư mục log (Đ10), câu miễn trừ nhãn hiệu (§10.1).
// Danh sách giấy phép sinh từ `THIRD_PARTY_NOTICES` (kế hoạch 07a, `Licenses.tsx`). Bấm 5 lần vào dòng phiên bản thì hiện bảng debug.
export function About() {
  const t = useT();
  const info = useApp((s) => s.info);
  const openLogDir = useApp((s) => s.openLogDir);
  const [clicks, setClicks] = useState(0);
  if (!info) return null;
  return (
    <>
      <div className="card">
        <h2>{info.name}</h2>
        <p onClick={() => setClicks((n) => n + 1)}>{t("about.version", { version: info.version })}</p>
        <div className="row">
          <button onClick={() => void openLogDir()}>{t("about.openLogs")}</button>
        </div>
        <p className="hint">{t("about.logsHint")}</p>
      </div>
      <div className="card">
        <h2>{t("about.legal")}</h2>
        <LegalDetails kind="eula" />
        <LegalDetails kind="privacy" />
      </div>
      <div className="card">
        <h2>{t("about.licenses")}</h2>
        <Licenses />
      </div>
      <p className="hint">{t("about.trademark")}</p>
      {clicks >= DEBUG_CLICKS && <DebugPanel />}
    </>
  );
}
