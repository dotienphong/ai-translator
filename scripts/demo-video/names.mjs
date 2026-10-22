// Tên bộ dữ liệu và bản thu của một kịch bản, `lang` và phông của trang dựng cảnh theo ngôn ngữ đích (spec
// 2026-10-22-website-ja-zh-ko §7). Bản ja/zh/ko dùng lại giọng đọc tiếng Anh của bản vi (`"voiceFrom": "vi"`) nhưng có chữ phụ đề
// riêng (data/live.<kịch bản>.json), nên tên bản thu và tên bộ chữ tách nhau. data.mjs, render.mjs, desktop.mjs cùng dùng.

/** Bộ chữ thật (data/live.<…>.json, data/compose.<…>.json): kịch bản tự khai `data`, không thì trùng tên kịch bản. */
export const dataName = (script, name) => script.data ?? name;

/** Bản thu (target/demo-video/voice48.<…>.wav, voice16, truth, data/voice.<…>.json): `voiceFrom`, không thì như bộ chữ. */
export const voiceName = (script, name) => script.voiceFrom ?? dataName(script, name);

const TAGS = { vi: "vi", en: "en", ja: "ja", zh: "zh-Hans", ko: "ko" };
/** Thẻ `lang` của trang dựng cảnh: Chrome chọn phông dự phòng cho chữ Hán theo nó (kanji kiểu Nhật ở bản ja). */
export const htmlLang = (target) => TAGS[target];

// Phông có sẵn của macOS cho chữ CJK, đứng sau "Demo UI" (Noto Sans: chữ Latin và tiếng Việt). Không thêm file phông vào repo.
const CJK_FONT = { ja: "Hiragino Sans", zh: "PingFang SC", ko: "Apple SD Gothic Neo" };
/** Chuỗi font-family của trang dựng và hai iframe của app; vi, en giữ đúng như các video đã quay. */
export const fontStack = (target) => (CJK_FONT[target] ? `"Demo UI","${CJK_FONT[target]}",sans-serif` : '"Demo UI",sans-serif');
