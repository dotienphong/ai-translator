import type { Screen } from "../../lib/ipc";
import { useApp, useT } from "./appStore";
import { Notice } from "./Notice";
import { About } from "./screens/About";
import { Home } from "./screens/Home";
import { Glossary, History, Transcript, Upgrade } from "./screens/Placeholders";
import { SettingsScreen } from "./screens/SettingsScreen";

const SCREENS: readonly Screen[] = ["home", "transcript", "history", "glossary", "settings", "upgrade", "about"];

const BODIES: Record<Screen, () => React.JSX.Element | null> = {
  home: Home,
  transcript: Transcript,
  history: History,
  glossary: Glossary,
  settings: SettingsScreen,
  upgrade: Upgrade,
  about: About,
};

// Khung cửa sổ chính: thanh điều hướng tới mọi màn hình ở §4.3.
export function Shell() {
  const t = useT();
  const screen = useApp((s) => s.screen);
  const navigate = useApp((s) => s.navigate);
  const Body = BODIES[screen];
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">{t("app.name")}</div>
        {SCREENS.map((s) => (
          <button key={s} aria-current={s === screen ? "page" : undefined} onClick={() => navigate(s)}>
            {t(`nav.${s}`)}
          </button>
        ))}
      </nav>
      <main className="content">
        <h1>{t(`nav.${screen}`)}</h1>
        <Notice />
        <Body />
      </main>
    </div>
  );
}
