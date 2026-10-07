// Tải dữ liệu cho trang: useLoad (một lần gọi) và usePaged (danh sách có "Tải thêm" theo next_cursor).
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api/client";
import type { Page } from "./api/types";

function toApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError(0, "internal", { message: String(e) });
}

export interface Loaded<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload(): void;
}

/**
 * Gọi `load` khi `deps` đổi hay khi reload(). Bỏ kết quả của lần gọi cũ nếu deps đã đổi.
 * `deps` phải có độ dài cố định và đủ mọi giá trị mà `load` đọc (`load` đổi mỗi lần render nên không nằm trong deps).
 * Khi `deps` đổi, `data` cũ được giữ trong lúc `loading` là true: trang dùng phải xử lý (ví dụ đặt `key` theo tham số).
 * `load` ném lỗi đồng bộ cũng thành `error` (ApiError), không làm sập trang.
 */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    // Promise.resolve().then: lỗi ném đồng bộ của `load` thành promise bị từ chối, đi qua toApiError như mọi lỗi khác.
    Promise.resolve()
      .then(load)
      .then(
        (data) => {
          if (live) setState({ data, error: null, loading: false });
        },
        (e: unknown) => {
          if (live) setState({ data: null, error: toApiError(e), loading: false });
        },
      );
    return () => {
      live = false;
    };
    // `load` đổi mỗi lần render; chỉ gọi lại khi deps của trang hay tick đổi.
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export interface Paged<T> {
  rows: T[];
  error: ApiError | null;
  loading: boolean;
  hasMore: boolean;
  more(): void;
  reload(): void;
}

/**
 * Danh sách có "Tải thêm". `fetchPage()` lấy trang đầu khi `deps` đổi hay khi reload(); `more()` lấy trang kế theo con trỏ.
 * `deps` phải có độ dài cố định và đủ mọi giá trị mà `fetchPage` đọc (bộ lọc…).
 * Khi `deps` đổi, `rows` cũ được giữ trong lúc `loading` là true: trang dùng phải xử lý (ví dụ đặt `key` theo bộ lọc).
 * Kết quả của lần gọi thuộc "thế hệ" cũ (deps đã đổi, hay đã reload) bị bỏ, kể cả trang "Tải thêm" và lỗi.
 */
export function usePaged<T>(fetchPage: (cursor?: string) => Promise<Page<T>>, deps: readonly unknown[]): Paged<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  // Thế hệ của bộ lọc hiện tại: tăng mỗi lần effect chạy hay dọn, để bỏ kết quả về muộn của bộ lọc cũ.
  const gen = useRef(0);
  useEffect(() => {
    const mine = ++gen.current;
    setLoading(true);
    setError(null);
    // Promise.resolve().then: lỗi ném đồng bộ của `fetchPage` thành promise bị từ chối, đi qua toApiError.
    Promise.resolve()
      .then(() => fetchPage())
      .then(
        (p) => {
          if (gen.current !== mine) return;
          setRows(p.items);
          setCursor(p.next_cursor);
          setLoading(false);
        },
        (e: unknown) => {
          if (gen.current !== mine) return;
          setRows([]);
          setCursor(null);
          setError(toApiError(e));
          setLoading(false);
        },
      );
    return () => {
      gen.current++;
    };
  }, [...deps, tick]);
  const more = () => {
    if (!cursor || loading) return;
    const mine = gen.current;
    setLoading(true);
    Promise.resolve()
      .then(() => fetchPage(cursor))
      .then(
        (p) => {
          if (gen.current !== mine) return;
          setRows((r) => [...r, ...p.items]);
          setCursor(p.next_cursor);
          setLoading(false);
        },
        (e: unknown) => {
          if (gen.current !== mine) return;
          setError(toApiError(e));
          setLoading(false);
        },
      );
  };
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { rows, error, loading, hasMore: cursor !== null, more, reload };
}
