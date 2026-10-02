import { useEffect, useRef } from "react";
import type { MessageKey, UiLanguage } from "../../../i18n";
import { useApp, useT } from "../appStore";
import { LanguagePicker } from "../LanguagePicker";
import { Notice } from "../Notice";
import { ListenTest } from "./ListenTest";
import { DownloadStep, ModelStep } from "./ModelSteps";
import { TaskbarGuide } from "./TaskbarGuide";

// Các bước lần đầu mở app (§4.1). Kế hoạch 01 làm khung và các bước 1, 5, 7, 8; bước 2–3 do kế
// hoạch 04 làm (kiểm tra máy, tải model), bước 4 do 02 (quyền ghi âm thanh hệ thống, chỉ macOS),
// bước 6 do 03 (nghe thử).
type Step = "language" | "model" | "download" | "permission" | "languages" | "test" | "privacy" | "tray";

const TITLES: Record<Step, MessageKey> = {
  language: "onboarding.language.title",
  model: "onboarding.model.title",
  download: "onboarding.download.title",
  permission: "onboarding.permission.title",
  languages: "onboarding.languages.title",
  test: "onboarding.test.title",
  privacy: "onboarding.privacy.title",
  tray: "onboarding.tray.title",
};

export function stepsFor(platform: "macos" | "windows"): Step[] {
  const steps: Step[] = ["language", "model", "download", "permission", "languages", "test", "privacy", "tray"];
  return platform === "macos" ? steps : steps.filter((s) => s !== "permission");
}

export function Onboarding() {
  const t = useT();
  const info = useApp((s) => s.info);
  const index = useApp((s) => s.onboardingStep);
  const setStep = useApp((s) => s.setOnboardingStep);
  const finish = useApp((s) => s.finishOnboarding);
  const title = useRef<HTMLHeadingElement>(null);
  const shown = useRef(index);
  // Sang bước khác thì đưa focus về tiêu đề của bước mới (nút vừa bấm có thể đã biến mất hay bị khóa).
  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    title.current?.focus();
  }, [index]);
  if (!info) return null;
  const steps = stepsFor(info.platform);
  const current = Math.min(index, steps.length - 1);
  const step = steps[current] ?? "language";
  const last = current === steps.length - 1;
  return (
    <main className="onboarding">
      <Notice />
      <p className="hint">{t("onboarding.step", { n: current + 1, total: steps.length })}</p>
      <h1 id="onboarding-title" ref={title} tabIndex={-1}>
        {t(TITLES[step])}
      </h1>
      <StepBody step={step} platform={info.platform} />
      <div className="actions">
        <button disabled={current === 0} onClick={() => setStep(current - 1)}>
          {t("onboarding.back")}
        </button>
        <button className="primary" onClick={() => (last ? void finish() : setStep(current + 1))}>
          {t(last ? "onboarding.finish" : "onboarding.next")}
        </button>
      </div>
    </main>
  );
}

function StepBody({ step, platform }: { step: Step; platform: "macos" | "windows" }) {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const openTaskbarSettings = useApp((s) => s.openTaskbarSettings);
  const openPermission = useApp((s) => s.openAudioPermissionSettings);
  switch (step) {
    // Ngôn ngữ đích mặc định theo ngôn ngữ giao diện (bước 5 đổi lại được).
    case "language":
      return (
        <div className="checks" role="radiogroup" aria-labelledby="onboarding-title">
          {(["vi", "en"] as UiLanguage[]).map((lang) => (
            <label key={lang}>
              <input
                type="radio"
                name="ui-language"
                checked={settings?.uiLanguage === lang}
                onChange={() => void update({ uiLanguage: lang, targetLanguage: lang })}
              />{" "}
              {t(`lang.${lang}`)}
            </label>
          ))}
        </div>
      );
    // Bước 4, chỉ macOS: quyền "Ghi âm thanh hệ thống" (§4.1). macOS tự hỏi ở lần đầu tạo tap; bước này nói trước cho
    // người dùng biết, và mở sẵn trang cài đặt cho ai đã lỡ từ chối.
    case "permission":
      return (
        <>
          <p>{t("onboarding.permission.body")}</p>
          <div className="row">
            <button onClick={() => void openPermission()}>{t("common.openPermissionSettings")}</button>
          </div>
        </>
      );
    case "model":
      return <ModelStep />;
    case "download":
      return <DownloadStep />;
    case "languages":
      return <LanguagePicker />;
    case "test":
      return <ListenTest />;
    case "privacy":
      return (
        <>
          <p>{t("onboarding.privacy.local")}</p>
          <p>{t("onboarding.privacy.notify")}</p>
        </>
      );
    case "tray":
      return platform === "macos" ? (
        <p>{t("onboarding.tray.macos")}</p>
      ) : (
        <>
          <p>{t("onboarding.tray.windows")}</p>
          <p>{t("onboarding.tray.windowsPin")}</p>
          <TaskbarGuide label={t("onboarding.tray.windowsPin")} />
          <div className="row">
            <button onClick={() => void openTaskbarSettings()}>{t("onboarding.tray.openTaskbarSettings")}</button>
          </div>
        </>
      );
    default:
      return <p className="hint">{t("common.notYet")}</p>;
  }
}
