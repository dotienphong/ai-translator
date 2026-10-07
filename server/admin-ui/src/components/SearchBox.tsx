// Ô tra cứu luôn hiện ở thanh trên (spec Web Admin §4.1, §4.3).
import { type FormEvent, useState } from "react";
import { navigate } from "../router";
import { detectQuery, setSearch } from "../search";

export function SearchBox() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      <input
        aria-label="Tra cứu"
        placeholder="Email, mã đơn, license key, license id hay mã máy"
        value={text}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
      />
      <button type="submit">Tìm</button>
      {error && (
        <span className="search-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
