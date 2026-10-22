// Chữ của chat hỗ trợ (src/assets/chat-strings.js): đủ năm ngôn ngữ cùng khóa, câu trích đúng hợp đồng phía khách (kế hoạch
// 2026-10-22-chat-ho-tro-00-tong-quan), liên kết chính sách có thật, không nhắc tên dịch vụ chuyển tin.
//   node --test test/chat-strings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { CHAT, SUPPORT_EMAIL } from "../src/assets/chat-strings.js";
import { LANG_CODES } from "../src/langs.mjs";
import { SITE } from "../src/site.mjs";
import { pages } from "../src/content/index.mjs";

test("chat-strings: đủ năm ngôn ngữ, cùng khóa như bản en, không chuỗi rỗng; email hỗ trợ khớp SITE.email", () => {
  assert.deepEqual(Object.keys(CHAT), LANG_CODES);
  const keys = Object.keys(CHAT.en).sort();
  for (const l of LANG_CODES) {
    assert.deepEqual(Object.keys(CHAT[l]).sort(), keys, `${l}: khác khóa bản en`);
    for (const [k, v] of Object.entries(CHAT[l])) assert.ok(typeof v === "string" && v.trim(), `${l}.${k} rỗng`);
    for (const k of ["off", "closed", "busy"]) assert.equal(CHAT[l][k].split("{email}").length, 2, `${l}.${k}: cần đúng một {email}`);
  }
  assert.equal(SUPPORT_EMAIL, SITE.email);
});

test("chat-strings: tiêu đề, dòng phụ, lời chào và chân khung trích đúng spec và hợp đồng (ja/zh/ko có nhãn tiếng Anh sau liên kết chính sách)", () => {
  assert.equal(CHAT.vi.title, "Hỗ trợ AI Translator");
  const want = {
    vi: ["Người thật trả lời, không phải bot · chưa cam kết thời gian trả lời", "Chào bạn 👋 Bạn cần giúp gì? Bạn có thể viết bằng tiếng Việt hoặc English.", "Tin nhắn được lưu 90 ngày · Quyền riêng tư"],
    en: ["A real person replies, not a bot · no guaranteed response time", "Hi 👋 How can we help? You can write in English or Vietnamese.", "Messages are kept for 90 days · Privacy"],
    ja: ["ボットではなく人が返信します · 返信時間は保証していません", "こんにちは 👋 どのようなご用件でしょうか？できれば英語でお書きください。", "メッセージは 90 日間保存されます · プライバシー（英語）"],
    zh: ["由真人回复，不是机器人 · 不保证回复时间", "你好 👋 有什么可以帮你？如果可以，请用英文书写。", "消息保存 90 天 · 隐私（英文）"],
    ko: ["봇이 아닌 사람이 답변합니다 · 답변 시간은 보장하지 않습니다", "안녕하세요 👋 무엇을 도와드릴까요? 가능하면 영어로 써 주세요.", "메시지는 90일간 보관됩니다 · 개인정보(영어)"],
  };
  for (const l of LANG_CODES) {
    const [sub, greeting, foot] = want[l];
    assert.equal(CHAT[l].sub, sub, `${l}: dòng phụ`);
    assert.equal(CHAT[l].greeting, greeting, `${l}: lời chào`);
    assert.equal(`${CHAT[l].keep} · ${CHAT[l].privacy}`, foot, `${l}: chân khung`);
  }
  const off = { vi: "Chat đang tạm tắt. Hãy gửi email tới support@aitranslator.io.vn", closed: "Cuộc trò chuyện đã đóng. Hãy gửi email tới support@aitranslator.io.vn" };
  assert.equal(CHAT.vi.off.replace("{email}", SUPPORT_EMAIL), off.vi);
  assert.equal(CHAT.vi.closed.replace("{email}", SUPPORT_EMAIL), off.closed);
});

test("chat-strings: liên kết Quyền riêng tư tới chính sách có thật (vi: bản vi; en, ja, zh, ko: bản en)", () => {
  const privacy = new Map(pages.filter((p) => p.id === "privacy").map((p) => [p.lang, p.path]));
  assert.equal(CHAT.vi.privacyHref, privacy.get("vi"));
  for (const l of ["en", "ja", "zh", "ko"]) assert.equal(CHAT[l].privacyHref, privacy.get("en"), l);
});

test("chat-strings: bản ja/zh/ko đã dịch (không chuỗi nào trùng bản en, trừ đường dẫn)", () => {
  for (const l of ["ja", "zh", "ko"]) {
    for (const [k, v] of Object.entries(CHAT[l])) if (k !== "privacyHref") assert.notEqual(v, CHAT.en[k], `${l}.${k} còn tiếng Anh`);
  }
});

test("chat-strings: nút bỏ qua thẻ email của ja/zh/ko là chữ \"bỏ qua\", không trùng nút Đóng", () => {
  assert.deepEqual([CHAT.ja.emailClose, CHAT.zh.emailClose, CHAT.ko.emailClose], ["スキップ", "跳过", "건너뛰기"]);
  for (const l of LANG_CODES) assert.notEqual(CHAT[l].emailClose, CHAT[l].close, l);
});

test("chat: không file nào trong src/assets (mã gửi xuống trình duyệt) nhắc tên dịch vụ chuyển tin, kể cả trong chú thích", async () => {
  const dir = new URL("../src/assets/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => /\.(js|css)$/.test(f));
  assert.ok(files.includes("chat-strings.js") && files.includes("site.js"), files.join(", "));
  for (const f of files) assert.ok(!/zalo/i.test(await readFile(new URL(f, dir), "utf8")), `src/assets/${f} nhắc Zalo`);
});
