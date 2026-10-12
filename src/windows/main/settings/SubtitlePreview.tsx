import { TwoTier } from "../../../components/TwoTier";
import { type MessageKey, type UiLanguage, translate } from "../../../i18n";
import type { BackgroundColor, TextColor } from "../../../lib/ipc";
import { TEXT_COLORS, overlayBackground, splitTail } from "../../../lib/subtitleView";

// Khung xem trước ở đầu nhóm Cài đặt › Phụ đề (§4.3): một câu mẫu vẽ theo đúng cài đặt (cả lúc đang kéo thanh trượt). Khi
// chế độ dịch trong lúc người nói chưa dừng có hiệu lực (spec 2026-10-10 §6.3), câu mẫu là một dòng đang nói hai tầng
// (`TwoTier`): phần ổn định như thường, phần tạm nhạt như trên thanh phụ đề. Câu mẫu hai tầng nằm trong từ điển dạng cả câu
// và phần tạm (`splitTail`), vì chuỗi giao diện không được có khoảng trắng ở đầu hay cuối.
export interface SubtitlePreviewProps {
  uiLanguage: UiLanguage;
  fontSize: number;
  opacity: number;
  textColor: TextColor;
  background: BackgroundColor;
  showSource: boolean;
  live: boolean;
}

export function SubtitlePreview({
  uiLanguage,
  fontSize,
  opacity,
  textColor,
  background,
  showSource,
  live,
}: SubtitlePreviewProps) {
  const t = (key: MessageKey) => translate(uiLanguage, key);
  const source = live
    ? splitTail(t("settings.subtitles.preview.live.source"), t("settings.subtitles.preview.live.sourceTail"))
    : { stable: t("settings.subtitles.preview.source"), tail: "" };
  const text = live
    ? splitTail(t("settings.subtitles.preview.live.text"), t("settings.subtitles.preview.live.textTail"))
    : { stable: t("settings.subtitles.preview.text"), tail: "" };
  return (
    <div className="subtitle-preview" role="img" aria-label={t("settings.subtitles.preview")}>
      <div
        className="bar"
        style={{
          fontSize: Math.min(fontSize, 34),
          color: TEXT_COLORS[textColor],
          background: overlayBackground(background, opacity),
        }}
      >
        {showSource && (
          <div className="src">
            <TwoTier {...source} />
          </div>
        )}
        <div className="main">
          <TwoTier {...text} />
        </div>
      </div>
    </div>
  );
}
