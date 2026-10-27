import { useCallback, useMemo, useRef, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { errorKey } from "../../i18n";
import type { ExportFormat, SpeakerVoice, SrtText, Transcript, TranscriptRef } from "../../lib/ipc";
import { NO_VOICES, type VoiceMap, decorate, mergeVoices } from "../../lib/speakers";
import { clockTime, localOffsetMinutes } from "../../lib/subtitleView";
import { searchLines } from "../../store/transcript";
import { fallbackLanguage, useApp, useT } from "./appStore";
import { useTranscript } from "./dataStores";
import { SpeakerMenu } from "./SpeakerMenu";
import { TranscriptRow } from "./TranscriptRow";

// Bảng giọng của bản chép lời, giữ nguyên đối tượng của giọng không đổi giữa hai lần vẽ (dòng memo của giọng đó không vẽ lại).
function useVoiceMap(speakers: readonly SpeakerVoice[]): VoiceMap {
  const previous = useRef<VoiceMap>(NO_VOICES);
  return useMemo(() => {
    previous.current = mergeVoices(previous.current, speakers);
    return previous.current;
  }, [speakers]);
}

// Một bản chép lời (§4.3): mỗi câu có giờ, câu gốc và bản dịch; tìm kiếm; sao chép (mọi gói); xuất TXT, SRT, Markdown
// (Pro). Dùng cho phiên hiện tại (màn hình Bản chép lời) và cho một phiên trong Lịch sử. Người nói (spec
// 2026-10-26-phan-biet-nguoi-noi §8.2): nhãn dạng chip có chấm màu ở câu đầu mỗi lượt nói, vạch màu bên trái các câu của giọng; bấm
// nhãn (phiên đang chạy) mở menu đổi tên, chọn người trong cuộc họp, gộp; Lịch sử và phiên đã dừng chỉ đọc.
export function TranscriptView({ transcript, source }: { transcript: Transcript; source: TranscriptRef }) {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? fallbackLanguage);
  const pro = useApp((s) => s.status?.pro ?? false);
  const navigate = useApp((s) => s.navigate);
  const copy = useTranscript((s) => s.copy);
  const exportTo = useTranscript((s) => s.exportTo);
  const participants = useTranscript((s) => s.participants);
  const renameSpeaker = useTranscript((s) => s.renameSpeaker);
  const mergeSpeakers = useTranscript((s) => s.mergeSpeakers);
  const notice = useTranscript((s) => s.notice);
  const error = useTranscript((s) => s.error);
  const dismiss = useTranscript((s) => s.dismiss);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<ExportFormat>("txt");
  const [srtText, setSrtText] = useState<SrtText>("translation");
  const [srtSpeakers, setSrtSpeakers] = useState(false);
  const [menuLine, setMenuLine] = useState<number | null>(null);
  const voices = useVoiceMap(transcript.speakers);
  // Đổi tên, gộp chỉ trong phiên đang chạy (QĐ 10 của kế hoạch 03).
  const editable = source.kind === "current" && transcript.session !== 0 && transcript.endedAt === null;
  const openMenu = useCallback((lineId: number) => setMenuLine((open) => (open === lineId ? null : lineId)), []);
  const closeMenu = useCallback(() => setMenuLine(null), []);
  // Giờ theo độ lệch múi giờ lúc bắt đầu phiên, như trong file xuất (N4 của review 03).
  const offset = localOffsetMinutes(transcript.startedAt);
  const rows = decorate(searchLines(transcript.lines, query), (l) => l.speaker, voices);
  return (
    <>
      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <label className="sr-only" htmlFor="transcript-search">
              {t("transcript.search")}
            </label>
            <input
              id="transcript-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("transcript.search.placeholder")}
            />
          </div>
          <span className="spacer" />
          <button onClick={() => void copy(source, transcript.startedAt)} disabled={transcript.lines.length === 0}>
            <Icon name="copy" size={16} />
            {t("transcript.copy")}
          </button>
        </div>
        <div className="toolbar">
          <label className="toolbar-label" htmlFor="export-format">
            {t("transcript.export")}
          </label>
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
          {format === "srt" && transcript.speakers.length > 0 && (
            <label className="toolbar-check">
              <input type="checkbox" checked={srtSpeakers} onChange={(e) => setSrtSpeakers(e.target.checked)} />
              {t("transcript.export.srtSpeakers")}
            </label>
          )}
          <button
            disabled={!pro || transcript.lines.length === 0}
            onClick={() => void exportTo(source, format, srtText, transcript.startedAt, srtSpeakers)}
          >
            <Icon name="download" size={16} />
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
          {notice?.kind === "copied" && (
            <p className="note">
              <Icon name="check" size={16} />
              <span>{t("transcript.copied")}</span>
            </p>
          )}
          {notice?.kind === "exported" && (
            <p className="note">
              <Icon name="check" size={16} />
              <span>{t("transcript.exported", { path: notice.path })}</span>
            </p>
          )}
        </div>
        <div role="alert">
          {error && (
            <div className="notice error">
              <Icon name="alert" />
              <span>{t(errorKey(error.code))}</span>
              <button onClick={dismiss}>{t("common.dismiss")}</button>
            </div>
          )}
        </div>
      </div>
      {transcript.lines.length > 0 && rows.length === 0 && <EmptyState icon="search" text={t("transcript.noMatch")} />}
      {rows.length > 0 && (
        <ol className="transcript">
          {rows.map(({ item: l, voice, turnStart }) => (
            <TranscriptRow
              key={l.id}
              line={l}
              lang={lang}
              time={clockTime(transcript.startedAt + l.start_ms, offset)}
              voice={voice}
              turnStart={turnStart}
              onSpeaker={editable ? openMenu : undefined}
              menu={
                editable && voice && menuLine === l.id ? (
                  <SpeakerMenu
                    lang={lang}
                    voice={voice}
                    voices={voices}
                    participants={participants}
                    onClose={closeMenu}
                    onRename={(name) => void renameSpeaker(voice.id, name).then((ok) => ok && closeMenu())}
                    onMerge={(into) => void mergeSpeakers(voice.id, into).then((ok) => ok && closeMenu())}
                  />
                ) : null
              }
            />
          ))}
        </ol>
      )}
    </>
  );
}
