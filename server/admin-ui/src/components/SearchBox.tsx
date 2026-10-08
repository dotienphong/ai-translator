// Ô tra cứu luôn hiện ở thanh trên (spec Web Admin §4.1, §4.3; giao diện mới mục 2): biểu tượng kính lúp, gợi ý phím tắt,
// phím `/` hay Ctrl/Cmd + K nhảy vào ô khi người dùng không đang gõ ở ô nhập khác và không có hộp thoại nào mở.
import { type FormEvent, useEffect, useRef, useState } from "react";
import { navigate } from "../router";
import { detectQuery, setSearch } from "../search";
import { IconAlert, IconSearch } from "./icons";

/** Đang gõ trong ô nhập, ô chọn, vùng soạn thảo: phím `/` là chữ, không phải phím tắt. */
function isTyping(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file"].includes(type);
}

/** Có hộp thoại (hộp xác nhận, ngăn kéo điện thoại) đang mở: không cướp focus ra khỏi nó. */
const dialogOpen = () => document.querySelector('[aria-modal="true"]') !== null;

export function SearchBox() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey;
      const cmdK = (e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
      if (!slash && !cmdK) return;
      if (dialogOpen()) return;
      // Ctrl/Cmd + K vẫn chạy khi đang ở ô nhập khác (không phải chữ gõ); `/` thì không.
      if (slash && isTyping(document.activeElement)) return;
      if (document.activeElement === input.current) {
        if (cmdK) e.preventDefault();
        return;
      }
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = detectQuery(text);
    if (!q) {
      setError("Không nhận ra loại chuỗi");
      return;
    }
    setError(null);
    if ("device_id_hash" in q) navigate(`/devices/${q.device_id_hash}`);
    else if ("order_code" in q) navigate(`/orders/${q.order_code}`);
    else if ("license_id" in q) navigate(`/licenses/${q.license_id}`);
    else {
      setSearch(q);
      navigate("/search");
    }
  }

  return (
    <form className="search" role="search" onSubmit={submit}>
      <div className="search-field">
        <IconSearch />
        <input
          ref={input}
          type="search"
          aria-label="Tra cứu"
          aria-keyshortcuts="/ Control+K Meta+K"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "tra-cuu-loi" : undefined}
          placeholder="Email, mã đơn, license key, license id hay mã máy"
          value={text}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            // Esc trong ô: xóa lỗi, rời ô (để phím tắt của trang hoạt động lại).
            if (e.key === "Escape") {
              setError(null);
              input.current?.blur();
            }
          }}
        />
        {text.trim() === "" ? (
          <span className="search-hint" aria-hidden="true">
            <kbd>/</kbd>
          </span>
        ) : (
          <button type="submit" className="primary small search-submit">
            Tìm
          </button>
        )}
      </div>
      {error && (
        <span className="search-error" id="tra-cuu-loi" role="alert">
          <IconAlert size={16} />
          {error}
        </span>
      )}
    </form>
  );
}
