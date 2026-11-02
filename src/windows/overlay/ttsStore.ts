import { Channel } from "@tauri-apps/api/core";
import { type TtsControl, tauriIpc } from "../../lib/ipc";
import { type AudioContextLike, TtsPlayer } from "../../lib/tts";
import { OVERLAY_TTS_COMMANDS, createTtsStore } from "../../store/tts";

// Giọng đọc của cửa sổ overlay (spec 2026-11-02-nghe-dich-truc-tiep §6): overlay là WebView riêng nên có store và bộ phát riêng, và
// dùng lệnh `overlay_tts_*` (quyền tối thiểu, `acl_tests`). AudioContext chỉ tạo ở lần đọc đầu tiên.
export const overlayTtsStore = createTtsStore({
  ipc: tauriIpc,
  commands: OVERLAY_TTS_COMMANDS,
  player: new TtsPlayer({
    createContext: () => new AudioContext() as unknown as AudioContextLike,
    markPlaying: (ms) => void tauriIpc.invoke("overlay_tts_mark_playing", { ms }).catch(() => {}),
  }),
  createChannel: () => new Channel<ArrayBuffer | TtsControl>(),
});
