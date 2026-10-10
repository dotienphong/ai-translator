import { useEffect, useState } from "react";
import { loadNotices } from "../../../lib/notices";
import { useT } from "../appStore";

// File sinh lúc build bản phát hành (scripts/release/notices.mjs); không có thì `notices` rỗng.
const notices = import.meta.glob<string>("/THIRD_PARTY_NOTICES.txt", { query: "?raw", import: "default" });

// Danh sách giấy phép mã nguồn mở ở màn hình Giới thiệu (§4.3, §10.1).
export function Licenses() {
  const t = useT();
  // undefined: đang tải; null: bản này không có danh sách.
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadNotices(notices).then((value) => {
      if (alive) setText(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (text === undefined) return <p className="hint">{t("about.licensesLoading")}</p>;
  if (text === null) return <p className="hint">{t("about.licensesMissing")}</p>;
  return (
    <>
      <p className="hint">{t("about.licensesIntro")}</p>
      <pre className="notices" tabIndex={0} aria-label={t("about.licenses")}>
        {text}
      </pre>
    </>
  );
}
