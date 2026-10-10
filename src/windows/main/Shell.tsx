import { useEffect, useRef } from "react";
import logo from "../../../app-icon.svg";
import { Icon, type IconName } from "../../components/Icon";
import type { Screen } from "../../lib/ipc";
import { useApp, useT } from "./appStore";
import { useLicense } from "./licenseStore";
import { PlanName } from "./LicenseText";
import { Notice } from "./Notice";
import { About } from "./screens/About";
import { Home } from "./screens/Home";
import { GlossaryScreen } from "./screens/GlossaryScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { UpgradeScreen } from "./screens/UpgradeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TranscriptScreen } from "./screens/TranscriptScreen";

const SCREENS: readonly Screen[] = ["home", "transcript", "history", "glossary", "settings", "upgrade", "about"];

const ICONS: Record<Screen, IconName> = {
  home: "home",
  transcript: "transcript",
  history: "history",
  glossary: "glossary",
  settings: "settings",
  upgrade: "upgrade",
  about: "about",
};

const BODIES: Record<Screen, () => React.JSX.Element | null> = {
  home: Home,
  transcript: TranscriptScreen,
  history: HistoryScreen,
  glossary: GlossaryScreen,
  settings: SettingsScreen,
  upgrade: UpgradeScreen,
  about: About,
};

// Khung cửa sổ chính: thanh điều hướng tới mọi màn hình ở §4.3. Đổi màn hình (bấm nút, menu khay, thanh báo)
// thì đưa focus về tiêu đề của màn hình mới, để người dùng bàn phím và trình đọc màn hình biết đã sang chỗ khác.
// Cửa sổ hẹp thì thanh điều hướng chỉ còn biểu tượng; tên màn hình vẫn là nhãn của nút (`aria-label`, `title`).
export function Shell() {
  const t = useT();
  const screen = useApp((s) => s.screen);
  const navigate = useApp((s) => s.navigate);
  const version = useApp((s) => s.info?.version);
  const plan = useLicense((s) => s.view?.plan ?? null);
  const Body = BODIES[screen];
  const title = useRef<HTMLHeadingElement>(null);
  const shown = useRef(screen);
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    if (shown.current === screen) return;
    shown.current = screen;
    content.current?.scrollTo({ top: 0 });
    title.current?.focus();
  }, [screen]);
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">
          <img src={logo} alt="" />
          <span>{t("app.name")}</span>
        </div>
        {SCREENS.map((s) => (
          <button
            key={s}
            className={s === "upgrade" ? "nav-upgrade" : undefined}
            aria-current={s === screen ? "page" : undefined}
            aria-label={t(`nav.${s}`)}
            title={t(`nav.${s}`)}
            onClick={() => navigate(s)}
          >
            <Icon name={ICONS[s]} />
            <span>{t(`nav.${s}`)}</span>
          </button>
        ))}
        <div className="nav-foot">
          {plan && <PlanName plan={plan} />}
          {plan && version && " · "}
          {version && `v${version}`}
        </div>
      </nav>
      <main className="content" ref={content}>
        <div className="page">
          <h1 ref={title} tabIndex={-1}>
            {t(`nav.${screen}`)}
          </h1>
          <Notice />
          <Body />
        </div>
      </main>
    </div>
  );
}
