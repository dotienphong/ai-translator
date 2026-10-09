import { pageHero, sectionHead, checkList, callout, ctaBand, appShot, overlayShot, facts, keys, steps, linkCard } from "../../build/components.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Solutions", path: "/en/solutions/" },
  { name: "Online meetings", path: "/en/solutions/online-meeting-translation/" },
];

export default {
  id: "solutions-meetings",
  lang: "en",
  path: "/en/solutions/online-meeting-translation/",
  title: "Translated subtitles for Zoom, Teams, Meet, Zalo",
  description:
    "Read live translated subtitles in Zoom, Teams, Google Meet and Zalo calls with AI Translator: no bot, runs offline. Setup tips and honest limits.",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "How to use AI Translator for translated subtitles in Zoom, Teams, Google Meet and Zalo calls: preparing before the call, shortcuts during it, the transcript afterwards, apps tested, privacy notes and limits.",
  llmTitle: "Translated subtitles for online meetings (Zoom, Teams, Meet, Zalo)",
  body: () => `
${pageHero({
  crumbs,
  title: "Translated subtitles for online meetings (Zoom, Teams, Meet, Zalo)",
  lead: "AI Translator shows live translated subtitles for Zoom, Microsoft Teams, Google Meet and Zalo PC calls by listening to the audio playing on your computer. There is no bot to invite, nothing for the host to switch on, and both speech recognition and translation run on your own machine.",
  meta: "<span>Updated {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["Works with", "Zoom, Microsoft Teams, Google Meet, Zalo PC<small>No bot, no plugin; any app that plays sound through your computer can be captured</small>"],
  ["Languages", "English, 中文, 日本語, 한국어, Tiếng Việt<small>One way, into the language you choose</small>"],
  ["Latency", "Median 0.76–1.03 seconds<small>Mac M4 Pro, Standard pack; slower machines will be slower</small>"],
  ["Platform", "macOS 14.2+ (Apple Silicon) and Windows 10/11 x64<small>The Windows build is not code-signed yet, so SmartScreen may warn during installation</small>"],
])}</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "The problem", title: "Why are meetings in another language so tiring?" })}
<p>In a meeting held in a foreign language you listen and translate in your head at the same time, and it is easy to lose a point when someone speaks fast or uses a lot of jargon. The big meeting platforms offer built-in translated captions, but they are usually part of higher paid plans and process your audio in the cloud, and most third-party tools run in the cloud too. If your organization's plan does not include that feature, or you do not want meeting audio to leave your computer, you need another way.</p>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-home-running", lang: "en", alt: "AI Translator main screen while translating: Translating status, languages, audio source and minutes left", caption: "The main screen while translating." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">How it works</span>
<h2>AI Translator runs on the listener's side</h2>
${checkList([
  "It captures the sound playing on your computer (on macOS you allow <em>System Audio Recording</em>; the microphone is not used; see <a href=\"/en/guide/macos-audio-permission/\">how to grant the permission</a>)",
  "It splits the audio into sentences, then recognizes and translates the speech with models running on your machine",
  "It shows the translation on a floating subtitle bar that never takes focus from the meeting app, so you can keep typing in chat",
  "Nobody else has to do anything: no bot in the room, no captions for the host to enable",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Before the meeting", title: "Five minutes of preparation", center: true })}
<div class="split wide-right">
<div>
${appShot({ slug: "app-settings-audio", lang: "en", alt: "Audio settings listing the apps that are playing sound so you can pick one as the source", caption: "Settings › Audio: listen to the whole system or to one app." })}
</div>
<div>
${steps(
  [
    { title: "Lock the source language if you know it", text: "On the Languages card, set <em>Source language</em> to the language of the meeting instead of <em>Detect automatically</em>; the app is less likely to guess wrong on short sentences. If several languages will be spoken, keep Detect automatically and tick only the ones that may come up." },
    { title: "Add proper names to the glossary (Pro)", text: "Enter partner names, product names and abbreviations with the translation you want, up to 500 entries. They are hints to the translator, not a guarantee. See the <a href=\"/en/guide/glossary/\">glossary guide</a>." },
    { title: "Place the subtitle bar and lock it", text: "Drag it where it does not cover the speaker, usually just under the video; set the font size (14–48 px), colors and opacity in Settings › Subtitles. Click <em>Lock (click-through)</em> so the mouse passes through the bar." },
    { title: "Listen to Zoom only (macOS)", text: "The list in Settings › Audio only shows apps that are playing sound, so join the call, then click <em>Refresh list</em>. Choose the Zoom entry (it reads <em>Only {app name}</em>) so notification sounds and other videos are not translated. For Meet in a browser, choose the browser (its other tabs are still heard). It takes effect from the next session." },
  ],
  true,
)}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "During the meeting", title: "Stay in control without leaving the call", text: "Press Start before the meeting begins so the models finish loading (a few seconds on later runs; the first run after installing or updating can take longer, up to a few minutes); silence does not count against your quota.", center: true })}
${overlayShot({ slug: "overlay-default", lang: "en", alt: "The AI Translator subtitle bar on a dark background: each sentence shows the original Japanese or Chinese in small type above its English translation", caption: "The subtitle bar: original text in small type above, translation below." })}
<div class="split">
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">Action</th><th scope="col">macOS</th></tr></thead>
<tbody>
<tr><th scope="row">Start or stop translating</th><td>${keys(["⌃", "⌥", "T"])}</td></tr>
<tr><th scope="row">Show or hide subtitles</th><td>${keys(["⌃", "⌥", "H"])}</td></tr>
<tr><th scope="row">Lock or unlock</th><td>${keys(["⌃", "⌥", "L"])}</td></tr>
<tr><th scope="row">Scroll up (older sentences)</th><td>${keys(["⌃", "⌥", "PageUp"])}</td></tr>
<tr><th scope="row">Scroll down (newer)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td></tr>
</tbody></table></div>
<div class="stack reveal">
${checkList([
  "<strong>Missed a sentence:</strong> scroll up to read it again (the last 1000 sentences are kept); the <em>Latest</em> button brings you back, and the scroll keys work even when the bar is locked.",
  "<strong>Faded text</strong> is a provisional subtitle that is replaced when the speaker carries on. Keep <em>Show the original text above the translation</em> on (it is on by default) to double-check names and numbers.",
  "<strong>Hide it fast</strong> with the shortcut, or with the ✕ button when you hover over an unlocked bar.",
])}
</div>
</div>
<p class="small muted">On Windows the shortcuts use Ctrl+Alt instead of ⌃⌥. Change them in Settings › Shortcuts if they clash with your meeting app. We have not checked whether the subtitle bar appears in the part of your screen you share, so test it first, or hide the bar while sharing. See <a href="/en/guide/subtitle-bar-and-shortcuts/">the subtitle bar and shortcuts</a>.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "After the meeting", title: "Keep what you need" })}
<p>After you press <strong>Stop</strong>, press <strong>Open the transcript</strong> to see every line with its time, original text and translation; there is a <em>Search</em> box and a <em>Copy all</em> button on every plan.</p>
<p>Exporting to TXT, SRT or Markdown and History are Pro features (see <a href="/en/pricing/">pricing</a>). History is off by default; turn it on in Settings › Privacy and each session is saved on your computer, encrypted. The app does not save the transcript to disk on its own, and it is a text transcript, not meeting minutes. See <a href="/en/guide/history-and-export/">history and export</a>.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "What we tested", title: "Apps and devices tried so far" })}
<p>Using a separate audio-capture test tool (not the app's full recognition and translation loop), we tested system-audio capture on macOS 26.6.2 with <strong>Zoom (app)</strong>, <strong>Google Meet</strong> in Chrome, Safari and Edge, <strong>Microsoft Teams (new app)</strong> and <strong>Zalo PC</strong>, through the speakers, wired headphones and AirPods.</p>
<p>This was internal testing, confirmed by ear by the tester. It is not a formal acceptance test on the release build for each app and macOS version (14.2 is the minimum). On Windows, we have only tried system audio capture and the subtitle bar on Windows 11 in internal testing, not each meeting app with the release build.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Privacy", title: "Privacy and notifying other participants" })}
<p>AI Translator captures the sound playing on your computer, which includes other people's voices. The audio stays in memory: it is not written to disk and not sent over the network (we checked with a proxy on macOS). The app does not record meetings. See <a href="/en/data-security/">data and security</a>.</p>
${callout({ title: "Other participants will not be told.", text: "Because there is no bot and the app does not connect to the meeting platform, the other participants see no notice that you are using AI Translator. If the law or your company's rules require it, you are responsible for telling the other participants that you use a translation tool. The <a href=\"/en/terms/\">Terms of use</a> (section 6) say the same. We do not give legal advice." })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Honest limits", title: "What to keep in mind" })}
${checkList([
  "<strong>Latency:</strong> median 0.76–1.03 seconds and p90 0.94–1.34 seconds, measured on a Mac M4 Pro with 24 GB, Standard pack. Less powerful machines will see higher latency: we have not measured an M1 Mac, and on one Windows laptop with integrated graphics the Standard pack missed our target. See <a href=\"/en/features/\">the measurement conditions</a>.",
  "<strong>Quality varies</strong> with the language and how clear the audio is. The Lite pack transcribes less accurately than Standard in Vietnamese, Japanese, Korean and Chinese. We have not measured accuracy over real Bluetooth headsets.",
  "<strong>Translations can be wrong,</strong> especially jargon and proper names. Do not rely on them for important decisions without checking with a qualified person.",
], true)}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Keep reading", title: "Next steps", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/en/guide/quick-start/", icon: "zap", title: "Quick start", text: "From installation to your first subtitles.", more: "Open the guide" })}
${linkCard({ href: "/en/compare/offline-vs-cloud-translation/", icon: "layers", title: "Offline vs cloud translation", text: "A balanced comparison of the two approaches.", more: "Read the comparison" })}
${linkCard({ href: "/en/solutions/webinar-and-video-translation/", icon: "play", title: "Webinars and videos", text: "Conference talks, courses, lectures.", more: "See the solution" })}
</div>
</div></section>

${ctaBand({ title: "Try it on your own call", text: "Start with the free 10-day trial, 30 minutes a day. No card, no account.", primary: { href: "/en/download/", label: "Download" }, secondary: { href: "/en/guide/quick-start/", label: "Quick start guide" } })}
`,
};
