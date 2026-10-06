import { Fragment, type ReactNode, useEffect, useState } from "react";
import { type LegalKind, loadLegal } from "../../lib/legal";
import { type Block, type Inline, parseMarkdown } from "../../lib/markdown";
import { useApp, useT } from "./appStore";

function inline(parts: Inline[]): ReactNode {
  return parts.map((p, i) =>
    p.type === "strong" ? <strong key={i}>{p.text}</strong> : p.type === "code" ? <code key={i}>{p.text}</code> : <Fragment key={i}>{p.text}</Fragment>,
  );
}

// Tiêu đề của văn bản nằm dưới tiêu đề của trang: `#` là h3, `##` là h4, `###` là h5.
const HEADINGS = ["h3", "h4", "h5"] as const;

function block(b: Block, key: number): ReactNode {
  switch (b.type) {
    case "heading": {
      const Tag = HEADINGS[b.level - 1] ?? "h5";
      return <Tag key={key}>{inline(b.content)}</Tag>;
    }
    case "paragraph":
      return <p key={key}>{inline(b.content)}</p>;
    case "quote":
      return <blockquote key={key}>{inline(b.content)}</blockquote>;
    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag key={key}>
          {b.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <table key={key}>
          <thead>
            <tr>
              {b.header.map((c, i) => (
                <th key={i}>{inline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, r) => (
              <tr key={r}>
                {row.map((c, i) => (
                  <td key={i}>{inline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

/** Một văn bản pháp lý theo ngôn ngữ giao diện. */
export function LegalDocument({ kind }: { kind: LegalKind }) {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "vi");
  // undefined: đang tải; null: không có hay tải lỗi.
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setText(undefined);
    void loadLegal(kind, lang).then((value) => {
      if (alive) setText(value);
    });
    return () => {
      alive = false;
    };
  }, [kind, lang]);
  if (text === undefined) return <p className="hint">{t("legal.loading")}</p>;
  if (text === null) return <p className="hint">{t("legal.missing")}</p>;
  return (
    <div className="legal" tabIndex={0} aria-label={t(kind === "eula" ? "legal.eula" : "legal.privacy")}>
      {parseMarkdown(text).map(block)}
    </div>
  );
}

/** Văn bản gập được; chỉ tải khi mở lần đầu. */
export function LegalDetails({ kind }: { kind: LegalKind }) {
  const t = useT();
  const [opened, setOpened] = useState(false);
  return (
    <details className="legal-details" onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary>{t(kind === "eula" ? "legal.eula" : "legal.privacy")}</summary>
      {opened && <LegalDocument kind={kind} />}
    </details>
  );
}
