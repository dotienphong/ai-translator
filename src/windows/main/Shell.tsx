import { useEffect, useRef } from "react";
import type { Screen } from "../../lib/ipc";
import { useApp, useT } from "./appStore";
import { Notice } from "./Notice";
import { About } from "./screens/About";
import { Home } from "./screens/Home";
import { GlossaryScreen } from "./screens/GlossaryScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { Upgrade } from "./screens/Placeholders";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TranscriptScreen } from "./screens/TranscriptScreen";

const SCREENS: readonly Screen[] = ["home", "transcript", "history", "glossary", "settings", "upgrade", "about"];

const BODIES: Record<Screen, () => React.JSX.Element | null> = {
  home: Home,
  transcript: TranscriptScreen,
  history: HistoryScreen,
  glossary: GlossaryScreen,
  settings: SettingsScreen,
  upgrade: Upgrade,
  about: About,
};

// Khung cửa sổ chính: thanh điều hướng tới mọi màn hình ở §4.3. Đổi màn hình (bấm nút, menu khay, thanh báo)
// thì đưa focus về tiêu đề của màn hình mới, để người dùng bàn phím và trình đọc màn hình biết đã sang chỗ khác.
export function Shell() {
  const t = useT();
  const screen = useApp((s) => s.screen);
  const navigate = useApp((s) => s.navigate);
  const Body = BODIES[screen];
  const title = useRef<HTMLHeadingElement>(null);
  const shown = useRef(screen);
  useEffect(() => {
    if (shown.current === screen) return;
    shown.current = screen;
    title.current?.focus();
  }, [screen]);
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
        <h1 ref={title} tabIndex={-1}>
          {t(`nav.${screen}`)}
        </h1>
        <Notice />
        <Body />
      </main>
    </div>
  );
}
