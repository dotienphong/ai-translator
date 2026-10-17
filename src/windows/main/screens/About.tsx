import { useState } from "react";
import logo from "../../../../app-icon.svg";
import { Icon } from "../../../components/Icon";
import { errorKey } from "../../../i18n";
import { useApp, useT } from "../appStore";
import { writeClipboard } from "../dataStores";
import { Licenses } from "./Licenses";
import { DebugPanel } from "../DebugPanel";
import { LegalDetails } from "../LegalDocument";

// Số lần bấm vào dòng phiên bản để mở bảng debug ẩn (§7).
const DEBUG_CLICKS = 5;

// Giới thiệu (§4.3): phiên bản, thư mục log (Đ10) và nút "Gửi log cho hỗ trợ" (spec 2026-10-17 §5: gửi ngay một báo cáo lỗi đã che dữ
// liệu cá nhân, hiện mã báo cáo để đọc cho hỗ trợ), câu miễn trừ nhãn hiệu (§10.1).
// Danh sách giấy phép sinh từ `THIRD_PARTY_NOTICES` (kế hoạch 07a, `Licenses.tsx`). Bấm 5 lần vào dòng phiên bản thì hiện bảng debug.
export function About() {
  const t = useT();
  const info = useApp((s) => s.info);
  const openLogDir = useApp((s) => s.openLogDir);
  const report = useApp((s) => s.logReport);
  const sendLogReport = useApp((s) => s.sendLogReport);
  const [clicks, setClicks] = useState(0);
  // Kết quả lần bấm "Sao chép mã" gần nhất; về `idle` mỗi lần gửi báo cáo mới.
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  if (!info) return null;
  async function copyCode(id: string) {
    try {
      await writeClipboard(id);
      setCopy("done");
    } catch {
      setCopy("failed");
    }
  }
  return (
    <>
      <div className="card">
        <div className="about-head">
          <img src={logo} alt="" />
          <div>
            <h2>{info.name}</h2>
            <p onClick={() => setClicks((n) => n + 1)}>{t("about.version", { version: info.version })}</p>
          </div>
        </div>
        <div className="about-logs">
          <p className="hint">{t("about.logsHint")}</p>
          <div className="actions">
            <button onClick={() => void openLogDir()}>
              <Icon name="external" size={16} />
              {t("about.openLogs")}
            </button>
            <button
              disabled={report.status === "sending"}
              onClick={() => {
                setCopy("idle");
                void sendLogReport();
              }}
            >
              <Icon name="upload" size={16} />
              {t(report.status === "sending" ? "about.sendLogs.sending" : "about.sendLogs")}
            </button>
          </div>
          {/* Vùng live luôn có trong DOM, nội dung chèn vào sau, để trình đọc màn hình đọc được kết quả. */}
          <div className="log-report" role="status">
            {report.status === "sent" && (
              <>
                <p className="note">
                  <Icon name="check" size={16} />
                  <span>
                    {t("about.sendLogs.sent")} <code className="report-code">{report.id}</code>
                  </span>
                </p>
                <p className="hint">{t("about.sendLogs.codeHint")}</p>
                <div className="actions">
                  <button onClick={() => void copyCode(report.id)}>
                    <Icon name="copy" size={16} />
                    {t("about.sendLogs.copy")}
                  </button>
                  {copy === "done" && <span className="note">{t("about.sendLogs.copied")}</span>}
                  {copy === "failed" && <span className="note error">{t(errorKey("copyFailed"))}</span>}
                </div>
              </>
            )}
            {report.status === "failed" && (
              <p className="note error">
                <Icon name="alert" size={16} />
                <span>{t(errorKey(report.code))}</span>
              </p>
            )}
          </div>
        </div>
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
      <p className="trademark">{t("about.trademark")}</p>
      {clicks >= DEBUG_CLICKS && <DebugPanel />}
    </>
  );
}
