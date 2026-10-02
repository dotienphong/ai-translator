import { useState } from "react";
import { errorKey } from "../../i18n";
import type { ExportFormat, SrtText, Transcript, TranscriptRef } from "../../lib/ipc";
import { clockTime, lineView, localOffsetMinutes } from "../../lib/subtitleView";
import { searchLines } from "../../store/transcript";
import { useApp, useT } from "./appStore";
import { useTranscript } from "./dataStores";

// Một bản chép lời (§4.3): mỗi câu có giờ, câu gốc và bản dịch; tìm kiếm; sao chép (mọi gói); xuất TXT, SRT, Markdown
// (Pro). Dùng cho phiên hiện tại (màn hình Bản chép lời) và cho một phiên trong Lịch sử.
export function TranscriptView({ transcript, source }: { transcript: Transcript; source: TranscriptRef }) {
  const t = useT();
  const pro = useApp((s) => s.status?.pro ?? false);
  const navigate = useApp((s) => s.navigate);
  const copy = useTranscript((s) => s.copy);
  const exportTo = useTranscript((s) => s.exportTo);
  const notice = useTranscript((s) => s.notice);
  const error = useTranscript((s) => s.error);
  const dismiss = useTranscript((s) => s.dismiss);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<ExportFormat>("txt");
  const [srtText, setSrtText] = useState<SrtText>("translation");
  // Giờ theo độ lệch múi giờ lúc bắt đầu phiên, như trong file xuất (N4 của review 03).
  const offset = localOffsetMinutes(transcript.startedAt);
  const lines = searchLines(transcript.lines, query);
  return (
    <>
      <div className="card">
        <div className="row">
          <label htmlFor="transcript-search">{t("transcript.search")}</label>
          <input
            id="transcript-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("transcript.search.placeholder")}
          />
          <button onClick={() => void copy(source, transcript.startedAt)} disabled={transcript.lines.length === 0}>
            {t("transcript.copy")}
          </button>
        </div>
        <div className="row">
          <label htmlFor="export-format">{t("transcript.export")}</label>
          <select id="export-format" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="txt">TXT</option>
            <option value="srt">SRT</option>
            <option value="markdown">Markdown</option>
          </select>
          {format === "srt" && (
            <select
              aria-label={t("transcript.export.srtText")}
              value={srtText}
              onChange={(e) => setSrtText(e.target.value as SrtText)}
            >
              <option value="translation">{t("transcript.export.translation")}</option>
              <option value="source">{t("transcript.export.source")}</option>
            </select>
          )}
          <button
            disabled={!pro || transcript.lines.length === 0}
            onClick={() => void exportTo(source, format, srtText, transcript.startedAt)}
          >
            {t("transcript.export.button")}
          </button>
          {!pro && (
            <button className="link" onClick={() => navigate("upgrade")}>
              {t("pro.upgrade")}
            </button>
          )}
        </div>
        {!pro && <p className="hint">{t("transcript.export.pro")}</p>}
        <div role="status">
          {notice?.kind === "copied" && <p className="hint">{t("transcript.copied")}</p>}
          {notice?.kind === "exported" && <p className="hint">{t("transcript.exported", { path: notice.path })}</p>}
        </div>
        <div role="alert">
          {error && (
            <div className="notice error">
              <span>{t(errorKey(error.code))}</span>
              <button onClick={dismiss}>{t("common.dismiss")}</button>
            </div>
          )}
        </div>
      </div>
      {transcript.lines.length > 0 && lines.length === 0 && <p className="empty">{t("transcript.noMatch")}</p>}
      <ol className="transcript">
        {lines.map((l) => {
          const v = lineView(l, true);
          const translation =
            v.kind === "translated" || v.kind === "translating" ? v.main : v.kind === "failed" ? t("subtitle.failed") : null;
          return (
            <li key={l.id} className={`${v.kind}${v.provisional ? " provisional" : ""}`}>
              <time>{clockTime(transcript.startedAt + l.start_ms, offset)}</time>
              <div>
                <div className="src" lang={l.src_lang}>
                  {v.kind === "dropped" ? t("subtitle.dropped") : l.src_text}
                </div>
                {translation && <div className="tgt">{translation}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
