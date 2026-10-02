import { useEffect, useRef, useState } from "react";
import { errorKey } from "../../../i18n";
import { afterListenTestStart } from "../../../lib/listenTest";
import { appStore, useApp, useT } from "../appStore";
import { useTranscript } from "../dataStores";

// Câu mẫu, dựng bằng `scripts/make_listen_test.py` (FLEURS, CC BY 4.0, xem `public/listen-test-en.LICENSE.txt`).
const SAMPLE = "/listen-test-en.wav";
// Phát xong câu mẫu thì chờ chừng này cho câu cuối dịch xong, rồi dừng phiên.
const SETTLE_MS = 6_000;

// Bước 6 "Nghe thử" (§4.1): bấm thì bắt đầu một phiên thu toàn hệ thống kể cả âm thanh của chính app
// (`start_listen_test`, Đ16), chờ phiên chạy (có thể đang nạp model), rồi phát câu tiếng Anh mẫu qua loa. Phụ đề hiện
// trên thanh phụ đề và ở đây. Phát xong vài giây thì tự dừng; rời bước này thì dừng phiên của bước này.
// Tiếng của webview đi qua tiến trình WebKit (macOS) hay WebView2 (Windows) chứ không qua tiến trình của app, nên được thu
// nhờ chế độ toàn hệ thống (ghi chú N8 của kế hoạch 02c).
export function ListenTest() {
  const t = useT();
  const status = useApp((s) => s.status);
  const pending = useApp((s) => s.sessionPending);
  const start = useApp((s) => s.startListenTest);
  const toggle = useApp((s) => s.toggleSession);
  const lines = useTranscript((s) => s.transcript?.lines ?? []);
  const audio = useRef<HTMLAudioElement>(null);
  const timer = useRef<number | null>(null);
  // Phiên đang chạy là của bước này (để chỉ dừng phiên của chính nó).
  const ours = useRef(false);
  // Đã rời bước này (component đã gỡ), kể cả trong lúc chờ `start_listen_test`.
  const left = useRef(false);
  const [played, setPlayed] = useState(false);
  const running = status?.session === "running";

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    audio.current?.pause();
    if (ours.current) {
      ours.current = false;
      void toggle();
    }
  };

  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
      stop();
    };
  }, []);

  const play = async () => {
    setPlayed(false);
    await start();
    // Phiên không chạy (lỗi, thiếu model, đã bấm Hủy): lỗi hiện bên dưới, không phát gì. Đã rời bước trong lúc chờ: dừng
    // phiên vừa bắt đầu.
    const next = afterListenTestStart(appStore.getState().status?.session === "running", left.current);
    if (next === "stop") void toggle();
    if (next !== "play" || !audio.current) return;
    ours.current = true;
    audio.current.currentTime = 0;
    await audio.current.play().catch(() => {});
    setPlayed(true);
  };

  const done = lines.find((l) => l.status === "done" && l.tgt_text);
  return (
    <>
      <p>{t("onboarding.test.body")}</p>
      <audio
        ref={audio}
        src={SAMPLE}
        preload="auto"
        onEnded={() => {
          timer.current = window.setTimeout(stop, SETTLE_MS);
        }}
      />
      <div className="row">
        <button className="primary" disabled={pending || running} onClick={() => void play()}>
          {t("onboarding.test.play")}
        </button>
        {running && ours.current && <button onClick={stop}>{t("home.stop")}</button>}
        {status?.loading && <span className="hint">{t("overlay.note.loading")}</span>}
      </div>
      <div role="status">
        {done && (
          <p>
            {t("onboarding.test.ok")} <strong>{done.tgt_text}</strong>
          </p>
        )}
        {played && !done && !running && <p className="hint">{t("onboarding.test.nothing")}</p>}
      </div>
      <div role="alert">
        {status?.session === "error" && status.sessionError && (
          <p className="error-text">{t(errorKey(status.sessionError))}</p>
        )}
      </div>
    </>
  );
}
