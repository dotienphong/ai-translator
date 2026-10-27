import { type CSSProperties, memo, type ReactNode } from "react";
import { type MessageKey, type Params, type UiLanguage, translate } from "../../i18n";
import type { SpeakerVoice, Subtitle } from "../../lib/ipc";
import { isolateName, speakerColor } from "../../lib/speakers";
import { lineView } from "../../lib/subtitleView";

export interface TranscriptRowProps {
  line: Subtitle;
  lang: UiLanguage;
  // Giờ đã định dạng (`HH:MM:SS`), để memo so bằng giá trị.
  time: string;
  // Giọng của câu (spec 2026-10-26-phan-biet-nguoi-noi §8.2); `null`: chưa xác định hay phiên không có nhận giọng.
  voice: SpeakerVoice | null;
  // Câu đầu của lượt nói: nhãn dạng chip có chấm màu.
  turnStart: boolean;
  // Bấm nhãn để mở menu (phiên đang chạy). Không có thì nhãn chỉ để đọc (Lịch sử, phiên đã dừng; QĐ 10 của kế hoạch 03).
  onSpeaker?: (lineId: number) => void;
  // Menu đang mở của dòng này (`SpeakerMenu`), hay `null`.
  menu: ReactNode;
}

// Một câu của bản chép lời (§4.3): giờ, câu gốc, bản dịch; với người nói thì nhãn ở câu đầu mỗi lượt và vạch màu bên trái (spec
// 2026-10-26-phan-biet-nguoi-noi §8.2). Memo so nông: bản dịch tới dần hay giọng khác đổi tên thì các dòng khác không vẽ lại.
export const TranscriptRow = memo(function TranscriptRow({
  line,
  lang,
  time,
  voice,
  turnStart,
  onSpeaker,
  menu,
}: TranscriptRowProps) {
  const t = (key: MessageKey, params?: Params) => translate(lang, key, params);
  const v = lineView(line, true);
  const translation =
    v.kind === "translated" || v.kind === "translating" ? v.main : v.kind === "failed" ? t("subtitle.failed") : null;
  const classes = [v.kind, v.provisional ? "provisional" : "", voice ? "spk" : "", voice && !turnStart ? "spk-cont" : ""]
    .filter(Boolean)
    .join(" ");
  const style = voice ? ({ "--spk": speakerColor(voice.color) } as CSSProperties) : undefined;
  return (
    <li className={classes} style={style}>
      <time>{time}</time>
      <div>
        {voice &&
          turnStart &&
          (onSpeaker ? (
            <button
              type="button"
              className="spk-chip"
              aria-haspopup="dialog"
              aria-expanded={menu !== null}
              aria-label={t("transcript.speaker.menu", { name: isolateName(voice.label) })}
              onClick={() => onSpeaker(line.id)}
            >
              <span className="label">{voice.label}</span>
              <span className="caret" aria-hidden="true">
                ▾
              </span>
            </button>
          ) : (
            <span className="spk-chip">
              <span className="label">{voice.label}</span>
            </span>
          ))}
        <div className="src" lang={line.src_lang}>
          {v.kind === "dropped" ? t("subtitle.dropped") : line.src_text}
        </div>
        {translation && <div className="tgt">{translation}</div>}
      </div>
      {menu}
    </li>
  );
});
