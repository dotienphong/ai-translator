// Test phần thuần của compare-llama.mjs: `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { SENTENCES, differences, translationPrompt } from "./compare-llama.mjs";

test("câu lệnh dịch theo mẫu của Hy-MT2", () => {
  assert.equal(
    translationPrompt("vi", "Hello."),
    "Translate the following segment into Vietnamese, without additional explanation.\n\nHello.",
  );
});

test("khác chữ hay khác số token đều tính là khác", () => {
  const a = SENTENCES.map((_, i) => ({ text: `câu ${i}`, tokens: 5 }));
  assert.deepEqual(differences(a, a.map((x) => ({ ...x }))), []);
  const b = a.map((x) => ({ ...x }));
  b[1] = { text: "câu khác", tokens: 5 };
  b[3] = { text: "câu 3", tokens: 6 };
  assert.deepEqual(differences(a, b), [
    'câu 2: A {"text":"câu 1","tokens":5} / B {"text":"câu khác","tokens":5}',
    'câu 4: A {"text":"câu 3","tokens":5} / B {"text":"câu 3","tokens":6}',
  ]);
});
