import { pageHero, callout, facts, appShot, overlayShot, keys, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Type & Translate", path: "/en/guide/type-and-translate/" },
];

const toc = [
  { level: 2, id: "how-to-use", text: "How Type & Translate works" },
  { level: 2, id: "keys", text: "Keys in the compose box" },
  { level: 2, id: "language", text: "Which language it translates into" },
  { level: 2, id: "accessibility", text: "Auto-paste on macOS: Accessibility" },
  { level: 2, id: "windows", text: "On Windows" },
  { level: 2, id: "when-paste-fails", text: "Limits and when pasting fails" },
  { level: 2, id: "privacy", text: "Where your text goes" },
];

export default {
  id: "guide-type-translate",
  lang: "en",
  path: "/en/guide/type-and-translate/",
  title: "Type & Translate: translate and paste chat messages",
  description:
    "How to use Type & Translate in AI Translator: press ⌃⌥G or Ctrl+Alt+G, type in your own language, Enter pastes the translation into the chat box you are using.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-17",
  modified: "2026-10-17",
  llm: "Guide to Type & Translate: open the compose box with ⌃⌥G (Ctrl+Alt+G), type a message, press Enter to paste the translation into the chat box of the app you are using; target language, the Accessibility permission on macOS, limits and privacy.",
  llmTitle: "Type & Translate in AI Translator",
  schema: [
    howTo({
      name: "Send a translated message with Type & Translate in AI Translator",
      description: "Write a message in your own language in the AI Translator compose box, paste the translation into a chat box and send it.",
      totalTime: "PT1M",
      steps: [
        { name: "Click into the chat box", text: "Open the chat app or web page you are using and click the box where you type messages." },
        { name: "Open the compose box", text: "Press ⌃⌥G on macOS or Ctrl+Alt+G on Windows. The Type & Translate box appears in the middle of the screen with the cursor already in it." },
        { name: "Type your message", text: "Type in your own language. Pause for a moment and the translation appears below." },
        { name: "Press Enter to paste", text: "The compose box closes and the translation is pasted into the chat box. Nothing has been sent yet." },
        { name: "Press Enter again to send", text: "Check the translation in the chat box, then press the chat app's Enter to send it." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Type & Translate",
  lead: "Type & Translate lets you message people who speak another language from the chat box of the app you are using. You type in your own language in a floating compose box, AI Translator translates it on your computer, then pastes the translation into the chat box for you to check and send.",
  meta: `<span>Updated {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "In this guide",
  body: `
${facts([
  ["Shortcut", "⌃⌥G on macOS, Ctrl+Alt+G on Windows<small>Change it in Settings › Shortcuts</small>"],
  ["Plans", "Every active plan<small>Including Free during the trial; does not use translation time</small>"],
  ["Languages", "English, 中文, 日本語, 한국어, Tiếng Việt<small>By default, the language of the people you talk to</small>"],
  ["Length", "Up to 4000 characters per message<small>Split lines that are too long</small>"],
  ["Network", "Not needed<small>Translated on your computer</small>"],
  ["Auto-paste on macOS", "Needs the Accessibility permission<small>Without it, the app copies the translation for you to paste</small>"],
])}

<h2 id="how-to-use">How does Type &amp; Translate work?</h2>
<ol>
<li>Click into the chat box of the app you are using (Messenger, Slack, Zalo, the Zoom chat…), as if you were about to type.</li>
<li>Press ${keys(["⌃", "⌥", "G"])} on macOS or ${keys(["Ctrl", "Alt", "G"])} on Windows. The <strong>Type &amp; Translate</strong> box appears in the middle of the screen that has the mouse pointer, with the cursor already in it. The chat app stays in front and keeps whatever is in its chat box.</li>
<li>Type your message in your own language. Pause for about half a second and AI Translator translates everything you have typed; the translation appears below as it is written. Keep typing and it translates again.</li>
<li>Press <strong>Enter</strong>. The compose box closes, the cursor goes back to the chat box and the translation is pasted there. <strong>Nothing has been sent yet.</strong></li>
<li>Check the translation in the chat box, edit it if needed, then press Enter (in the chat app) to send it.</li>
</ol>
${overlayShot({
  slug: "compose-done",
  lang: "en",
  alt: "The Type & Translate box: the top line shows Type & Translate and the target language Vietnamese, the text box holds a short English message, the Vietnamese translation is below, and the footer says Enter: paste, Shift+Enter: new line, Esc: close",
  caption: "The Type & Translate box once the translation is ready: press Enter to paste it into the chat box.",
})}
<p>The top line of the compose box shows the language it translates into and what it is doing: “Loading models…” (the first time after the app has been idle for a while), “Translating…”, or “Already in English” when your message is already in the target language (Enter then pastes it as you typed it). The translation is shown faded while it does not match your text yet.</p>
<p>Your draft is kept when you close the compose box with Esc, with the shortcut or by clicking outside it. Open it again and your text is still there, already selected so you can type over it. After pasting, the box is empty; the draft is lost when you quit the app.</p>
${callout({
  title: "The models must be downloaded, as for subtitles.",
  text: "Type & Translate uses the same translation model as the subtitles, so it needs a downloaded model pack (Settings › Model). It also works while subtitles are running; then each message you translate can make the subtitles appear a little later. Type & Translate does not use the glossary.",
})}

<h2 id="keys">Keys in the compose box</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Key</th><th scope="col">What it does</th></tr></thead>
<tbody>
<tr><th scope="row">Enter</th><td>Pastes the translation into the chat box. While translating, it pastes once the translation is done. If translating failed, it translates again: the app <strong>never pastes your original text</strong> after a failed translation. In an empty box, it closes the box.</td></tr>
<tr><th scope="row">Shift+Enter</th><td>New line. Each line is translated separately and the translation keeps your lines.</td></tr>
<tr><th scope="row">Esc</th><td>Closes the compose box without pasting and keeps your draft.</td></tr>
<tr><th scope="row">${keys(["⌃", "⌥", "G"])} / ${keys(["Ctrl", "Alt", "G"])}</th><td>While the compose box is open: closes it, like Esc.</td></tr>
<tr><th scope="row">Clicking outside the box</th><td>Closes it, like Esc.</td></tr>
</tbody></table></div>
<p>While an input method is choosing characters (Japanese, Chinese or Korean input), Enter only confirms the characters and does not paste. You can change the shortcut in <strong>Settings › Shortcuts</strong>, on the “Open Type &amp; Translate” row (see <a href="/en/guide/subtitle-bar-and-shortcuts/">subtitle bar and shortcuts</a>).</p>

<h2 id="language">Which language does it translate into?</h2>
<p>By default, <strong>the language of the people you talk to</strong>, worked out from the subtitle settings: “Automatic uses the language of the people you talk to, from the subtitle settings: the meeting language if there is only one, otherwise English (Vietnamese when the subtitles are in English).” For example, if you read subtitles in Vietnamese and have locked the source language to Japanese, Type &amp; Translate translates into Japanese.</p>
<p>To always use one language, open <strong>Settings › Type &amp; Translate</strong> and choose it under <strong>Translate into</strong>: “Automatic (now …)” or one of the five languages. This group also has the <strong>Turn on Type &amp; Translate</strong> switch: when it is off, the compose box shortcut does nothing (the shortcut you chose is kept).</p>
${appShot({
  slug: "app-settings-compose",
  lang: "en",
  alt: "The Type & Translate settings group: the Turn on Type & Translate switch, Translate into set to Automatic, the Paste into the chat box automatically switch and the Accessibility permission row showing Granted with an Open Accessibility settings button",
  caption: "Settings › Type & Translate on macOS.",
})}

<h2 id="accessibility">Auto-paste on macOS: the Accessibility permission</h2>
<p>To paste the translation into another app for you, macOS requires the <strong>Accessibility</strong> permission. AI Translator uses it only to send the ⌘V paste keys to the chat box you are typing in; the app does not read text or content from other apps.</p>
<ol>
<li>The first time you press Enter without the permission, the compose box stays open: the translation has been copied and the box says “Translation copied. To let AI Translator paste it for you, allow it in Accessibility.” You can press Enter or Esc and paste with ⌘V in the chat box yourself.</li>
<li>Click <strong>Turn on auto-paste</strong>. macOS opens System Settings › Privacy &amp; Security › Accessibility; turn on the switch for AI Translator.</li>
<li>If you do not want to grant it, click <strong>Always copy only</strong>: from then on Enter only copies the translation and closes the compose box, and you paste with ⌘V. Change this back in <strong>Settings › Type &amp; Translate › Paste into the chat box automatically</strong>.</li>
</ol>
<p>The permission status is shown in Settings › Type &amp; Translate, on the <strong>Accessibility permission</strong> row (“Granted.” or “Not granted. …”), next to an <strong>Open Accessibility settings</strong> button.</p>
${callout({
  kind: "warn",
  title: "After an app update, you may have to turn the permission on again.",
  text: "The macOS version is not yet signed with an Apple developer certificate, so after each update macOS may treat AI Translator as a different app: its entry in Accessibility is still on but the app still says it is not granted. Then remove AI Translator from the list (the − button) and add it again (the + button), or turn its switch off and on again. Until it has the permission, Type & Translate still copies the translation for you to paste.",
})}

<h2 id="windows">On Windows</h2>
<p>Windows needs no permission. When you press Enter, AI Translator brings the window you were chatting in back to the front and sends Ctrl+V. If that window has closed, or does not come to the front in time, the app only copies the translation (it does not send keys to another window) so you can paste it with Ctrl+V yourself.</p>
<p class="small muted">The Windows version includes this feature, but we have not yet tried it on a real Windows computer. If something goes wrong, please tell us on the <a href="/en/contact/">contact</a> page.</p>

<h2 id="when-paste-fails">Limits and when pasting fails</h2>
<ul>
<li><strong>What we have tried:</strong> on macOS, in the Chrome browser and TextEdit; we have not yet tried every chat app. Pasting works by sending ⌘V (Ctrl+V) to the box you are typing in, so it usually works in any box that accepts pasting; if an app behaves oddly, tell us on the <a href="/en/contact/">contact</a> page.</li>
<li><strong>The translation is always on the clipboard.</strong> After pasting, the translation stays on the clipboard (it replaces what was there). If the text does not appear in the chat box, click into it and paste with ⌘V or Ctrl+V yourself.</li>
<li><strong>Some boxes do not accept automatic pasting:</strong> password fields (macOS blocks keys sent by other apps there), apps running as administrator on Windows, and apps that block pasting. The app cannot detect these cases.</li>
<li><strong>Up to 4000 characters per message.</strong> When one line is too long, the compose box says “A line is too long to translate. Split it into several lines or messages.”</li>
<li><strong>Translation failed:</strong> the compose box says “Could not translate this text. Press Enter to try again.”</li>
<li><strong>The shortcut does not open the compose box:</strong> check that Settings › Type &amp; Translate is turned on; on Windows another app may hold the shortcut (Settings › Shortcuts shows it as not registered), so choose another one. On macOS, if another app also uses ⌃⌥G, change the shortcut of one of them.</li>
</ul>
<p>Other errors (models not downloaded, trial ended, key locked) appear in the compose box with a button that opens the right screen of the app. See also <a href="/en/guide/troubleshooting/">troubleshooting</a>.</p>

<h2 id="privacy">Where does your text go?</h2>
<p>Nowhere. The text you type and its translation stay only in AI Translator's memory on your computer: they are not sent over the network, not written to disk, and not in logs or error reports. The app only <strong>writes</strong> the translation to the clipboard to paste it; it does not read the clipboard or text from other apps. See <a href="/en/data-security/">data and security</a>.</p>
`,
})}
${docNav(
  [
    { href: "/en/guide/subtitle-bar-and-shortcuts/", kicker: "Previous", title: "Subtitle bar and shortcuts" },
    { href: "/en/guide/glossary/", kicker: "Next", title: "Use the glossary" },
  ],
  "Related guides",
)}
</div></section>
`,
};
