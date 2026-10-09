import { pageHero, appShot, facts, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Audio permission", path: "/en/guide/macos-audio-permission/" },
];

const toc = [
  { level: 2, id: "which-permission", text: "Which permission does the app need?" },
  { level: 2, id: "permission-prompt", text: "The macOS permission prompt" },
  { level: 2, id: "if-you-refused", text: "If you refused it" },
  { level: 2, id: "signs-of-missing-permission", text: "Signs the permission is missing" },
  { level: 2, id: "why-no-error", text: "Why macOS shows no error" },
  { level: 2, id: "after-updates", text: "After every update" },
  { level: 2, id: "audio-source", text: "Choosing the audio source" },
];

const HOWTO_STEPS = [
  { name: "Open System Settings", text: "Click Open System Settings in AI Translator, or open System Settings yourself and choose Privacy & Security." },
  { name: "Open Screen & System Audio Recording", text: "In Privacy & Security, choose Screen & System Audio Recording." },
  { name: "Turn on AI Translator", text: "Under System Audio Recording Only, switch on AI Translator." },
  { name: "Try again", text: "Reopen AI Translator if needed, click Start and play some sound to check that subtitles appear." },
];

export default {
  id: "guide-audio-permission",
  lang: "en",
  path: "/en/guide/macos-audio-permission/",
  title: "Grant system audio recording permission on macOS",
  description:
    "Grant AI Translator the System Audio Recording permission on macOS: answer the prompt, re-enable it in System Settings, spot a missing permission, pick a source.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Granting the System Audio Recording permission to AI Translator on macOS, turning it back on after refusing, signs of a missing permission, and choosing whole-system or single-app audio.",
  llmTitle: "Grant system audio recording permission on macOS",
  schema: [
    howTo({
      name: "Turn System Audio Recording back on for AI Translator",
      description: "How to switch on the System Audio Recording permission for AI Translator in System Settings after refusing the macOS prompt.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Grant system audio recording permission on macOS",
  lead: "AI Translator needs exactly one macOS permission: System Audio Recording, so it can hear the audio your Mac is playing. It does not use the microphone. If you refused it by mistake, turn it back on in System Settings › Privacy & Security › Screen & System Audio Recording.",
  meta: "<span>macOS 14.2 or later only</span> <span>Updated {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "In this guide",
  body: `
<h2 id="which-permission">Which permission does the app need?</h2>
<p>AI Translator captures the audio playing on your computer (meeting sound, a video, a webinar) so it can recognize and translate it. That is why macOS requires the <strong>System Audio Recording</strong> permission. The app <strong>does not use the microphone</strong>, does not record your voice, and does not save the meeting to disk: audio stays in memory while it translates. Windows has no such permission step.</p>
${facts([
  ["Permission", "System Audio Recording"],
  ["Where to turn it back on", "System Settings › Privacy &amp; Security › Screen &amp; System Audio Recording › System Audio Recording Only"],
  ["When macOS asks", "The first time AI Translator captures audio: at the “Try it” step or the first time you click Start"],
])}

<h2 id="permission-prompt">The macOS permission prompt</h2>
<p>The first time AI Translator captures audio, macOS shows a permission prompt with an explanation that we wrote, in your Mac's language. The English version reads:</p>
<blockquote>AI Translator captures the audio your Mac is playing to show translated subtitles. The audio never leaves your Mac.</blockquote>
<p>The Vietnamese version reads “AI Translator thu âm thanh máy đang phát để hiện phụ đề dịch. Âm thanh không rời khỏi máy.” Allow it. The app also tells you about it in step 5 of 9 of the first-time setup (see the <a href="/en/guide/quick-start/">quick start guide</a>).</p>
${appShot({ slug: "app-onboarding-5", lang: "en", alt: "Allow system audio recording step of the setup wizard, with an Open System Settings button", caption: "Step 5 of 9: the app explains the permission and offers an Open System Settings button." })}

<h2 id="if-you-refused">If you refused it: turn it back on in System Settings</h2>
<ol>
<li>In AI Translator, click <strong>Open System Settings</strong> (it is on step 5 of the setup and on the Home screen when the app reports a missing permission). Or open System Settings yourself.</li>
<li>Choose <strong>Privacy &amp; Security</strong>, then <strong>Screen &amp; System Audio Recording</strong>.</li>
<li>Find <strong>System Audio Recording Only</strong> and switch on <strong>AI Translator</strong>.</li>
<li>Go back to the app, click <strong>Start</strong> and play something with sound.</li>
</ol>
<p>If subtitles still do not appear, quit AI Translator completely (choose <strong>Quit</strong> from its menu bar icon) and open it again. If you do not see AI Translator in the list yet, go back to the app and click Start once (or Play a sample sentence if you are in the setup wizard) so macOS asks for the permission; the app usually appears in the list afterwards, then check again. The names of the items in System Settings may differ a little between macOS versions.</p>

<h2 id="signs-of-missing-permission">Signs the permission is missing</h2>
<p>Without the permission, no subtitles appear even though the meeting has sound, and the “Input level” bar on the Home screen stays flat. After a stretch of silence while another app is known to be playing sound, the <strong>Home screen</strong> says:</p>
<blockquote>Nothing is heard although an app is playing sound: AI Translator may not be allowed to record system audio.</blockquote>
<p>It comes with an <strong>Open System Settings</strong> button. If the session stops because of the missing permission, the Home screen says “AI Translator is not allowed to record system audio.” with the same button. Do not confuse these with the general reminder on the subtitle bar, “No audio heard. Check that the meeting sound is playing.”: that only means there has been no sound for a while, which can simply be a quiet meeting.</p>

<h2 id="why-no-error">Why macOS shows no error when you refuse</h2>
<p>When permission is denied, macOS still lets the app create the capture source and still reports it as running, but every sample it delivers is silence. With no error to report, AI Translator can only detect a missing permission by waiting for a long silence while another app is playing sound. That is why the warning appears after a while rather than immediately.</p>

<h2 id="after-updates">After every update, macOS may ask again</h2>
<p>The current macOS build is ad-hoc signed, so after each update macOS may ask once more for this recording permission (along with 1 Keychain dialog). Allow it; you lose no data, plan or quota. Details in the <a href="/en/guide/install-macos/">macOS installation guide</a>.</p>

<h2 id="audio-source">Choosing the audio source: whole system or one app</h2>
<p>The permission covers both modes. Choose the mode in <strong>Settings › Audio › Audio source</strong>:</p>
<ul>
<li><strong>Whole system, except this app</strong> (default): translates everything your Mac plays, including notification sounds.</li>
<li><strong>“Only” plus an app name</strong>: pick your meeting app. Other sounds, such as notifications, are not translated. Safari and web pages inside other apps are grouped as “Safari and web pages inside other apps”.</li>
</ul>
<p>The list only shows apps that are <em>playing sound right now</em>; click <strong>Refresh list</strong> after your meeting starts. A new source applies from the next session. If the chosen app stops playing sound, the app says “The chosen app is not playing sound” and carries on as soon as it plays again.</p>
${appShot({ slug: "app-settings-audio", lang: "en", alt: "Audio settings with the audio source list, a Refresh list button and the pause-that-ends-a-sentence slider", caption: "Settings › Audio: source and sentence-pause sensitivity." })}

${docNav(
  [
    { href: "/en/guide/install-macos/", kicker: "Previous", title: "Install AI Translator on macOS" },
    { href: "/en/guide/subtitle-bar-and-shortcuts/", kicker: "Next", title: "The subtitle bar and shortcuts" },
    { href: "/en/guide/troubleshooting/", kicker: "Related", title: "Troubleshooting" },
  ],
  "Related guides",
)}
`,
})}
</div></section>
`,
};
