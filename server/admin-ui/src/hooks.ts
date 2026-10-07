// Tải dữ liệu cho trang: useLoad (một lần gọi) và usePaged (danh sách có "Tải thêm" theo next_cursor).
import { useCallback, useEffect, useState } from "react";
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

/** Gọi `load` khi `deps` đổi hay khi reload(). Bỏ kết quả của lần gọi cũ nếu deps đã đổi. */
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
    load().then(
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

export function usePaged<T>(fetchPage: (cursor?: string) => Promise<Page<T>>, deps: readonly unknown[]): Paged<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetchPage().then(
      (p) => {
        if (!live) return;
        setRows(p.items);
        setCursor(p.next_cursor);
        setLoading(false);
      },
      (e: unknown) => {
        if (!live) return;
        setRows([]);
        setCursor(null);
        setError(toApiError(e));
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [...deps, tick]);
  const more = () => {
    if (!cursor || loading) return;
    setLoading(true);
    fetchPage(cursor).then(
      (p) => {
        setRows((r) => [...r, ...p.items]);
        setCursor(p.next_cursor);
        setLoading(false);
      },
      (e: unknown) => {
        setError(toApiError(e));
        setLoading(false);
      },
    );
  };
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { rows, error, loading, hasMore: cursor !== null, more, reload };
}
