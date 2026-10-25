import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, overlayShot, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Solutions", path: "/en/solutions/" },
  { name: "Livestream translation", path: "/en/solutions/livestream-translation/" },
];

const FAQ = [
  {
    q: "How do I translate a livestream into my language?",
    a: `<p>Install AI Translator on your computer, open the livestream in a browser, choose the language you want to read in Translate into (English, Vietnamese, Chinese, Japanese or Korean) and press Start. The app listens to the audio playing on your computer and shows translated subtitles on a floating bar, with a median delay of 0.76–1.03 seconds from when the speaker finishes a sentence, measured on a Mac M4 Pro (Standard pack). Translation quality has been measured only for pairs that include Vietnamese (<a href="/en/features/#quality-by-direction">see the table</a>); other pairs, such as Japanese to English, work but have no measured score.</p>`,
  },
  {
    q: "Does it work with TikTok Live, YouTube and Facebook Live?",
    a: `<p>The app captures your computer's system audio, so it does not depend on the platform: if a livestream plays sound on your computer, the app can hear it. We have tested it with videos playing in a browser. We have not tested each livestream platform. See also <a href="/en/solutions/tiktok-live-translation/">translating TikTok Live</a>.</p>`,
  },
  {
    q: "Can I translate a livestream on my phone?",
    a: `<p>No. AI Translator only runs on macOS (Apple Silicon) and Windows 10/11, so it works only when you watch the livestream on a computer.</p>`,
  },
  {
    q: "Does realtime translation need the internet?",
    a: `<p>Not for the translation itself: speech recognition, translation and subtitles run on your computer, and your audio is not sent anywhere. You still need the internet to watch the livestream.</p>`,
  },
  {
    q: "Can I translate my own livestream for my viewers?",
    a: `<p>No. AI Translator has no feature that adds subtitles or a translated voice to your livestream. It makes subtitles for the person using the app to read, on a floating bar on their own computer.</p>`,
  },
  {
    q: "Is live translation free?",
    a: `<p>The Free plan is a 10-day trial with up to 30 minutes of translation a day, no card and no account. After that you need a prepaid plan; see <a href="/en/pricing/">pricing</a>. Free is a trial, not a permanent free plan.</p>`,
  },
];

export default {
  id: "solutions-livestream",
  lang: "en",
  path: "/en/solutions/livestream-translation/",
  title: "Live video translator: real-time livestream subtitles",
  description:
    "Real-time translation for livestreams on your computer: translated subtitles for YouTube, TikTok and Facebook Live, with the AI running on your own machine.",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  llm: "How to use AI Translator as a live video translator for livestreams on a computer: real-time translated subtitles, four steps, tips for live video you often cannot rewind, quota, honest limits (no phones, no translating your own livestream) and FAQ.",
  llmTitle: "Live video translator: real-time subtitles for livestreams",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "Live video translator: real-time subtitles for livestreams",
  lead: "AI Translator is a live video translator for your computer: it gives you real-time translation of a livestream as subtitles on your screen. It listens to the audio playing on your machine, so it works with live video in a browser without any extension, and both speech recognition and translation run on your own computer. It runs only on macOS and Windows, not on phones, and it makes subtitles only for the viewer: it does not translate your own livestream for your audience.",
  meta: "<span>Updated {{updated}}</span><span>Runs on macOS and Windows computers, not on phones</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["Works with", "Livestreams playing in a browser or app on your computer<small>TikTok Live, YouTube, Facebook Live: the app hears your computer's sound, so it does not depend on the platform; we have not tested each platform individually</small>"],
  ["Languages", "English, Chinese (中文), Japanese (日本語), Korean (한국어), Vietnamese (Tiếng Việt)<small>Only the pairs that include Vietnamese have a measured translation quality</small>"],
  ["Delay", "Median 0.76–1.03 seconds<small>After the speaker finishes a sentence; Mac M4 Pro, Standard pack; slower machines will be slower</small>"],
  ["Platform", "macOS 14.2+ (Apple Silicon) and Windows 10/11 x64<small>No version for phones or tablets</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Who it is for", title: "When the livestream is great but not in your language", center: true })}
<div class="grid grid-3">
${feature({ icon: "play", title: "Viewers of livestreams in another language", text: "Livestreams in English, Chinese, Japanese or Korean from creators, speakers or broadcasters that you want to understand while they are live." })}
${feature({ icon: "users", title: "People following live events", text: "Conferences, product launches or live-selling streams in a foreign language, where you only watch and listen." })}
${feature({ icon: "book", title: "Learners", text: "Live lectures, classes and talks in a foreign language that you want to follow sentence by sentence." })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">How it works</span>
<h2>Real-time livestream translation on your own computer</h2>
${checkList([
  "You open the livestream in a browser (or an app) on your computer and press <strong>Start</strong> in AI Translator",
  "The app captures the sound playing on your computer, splits it into sentences, then recognizes and translates the speech on your machine",
  "The translation appears on a floating subtitle bar above the livestream window, with the original in small type above it",
  "No browser extension is needed, and the app does not connect to any platform account; the bar never takes focus from the window you are using, so you can keep typing in chat",
])}
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "en", alt: "The AI Translator subtitle bar showing three sentences: a Chinese sentence in small type above its English translation in large type, and two sentences already in English shown on a single line each", caption: "The real subtitle bar: original text in small type above, translation below." })}
</div>
</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Get started", title: "Four steps to watch a livestream with translated subtitles" })}
${steps([
  { title: "Open the livestream on your computer", text: "Open the livestream in a browser (or an app) on your computer and let it play sound. On macOS, the first time you press Start the system asks for the <em>System Audio Recording</em> permission: see <a href=\"/en/guide/macos-audio-permission/\">how to grant it</a>." },
  { title: "Choose the language", text: "Set <em>Translate into</em> to the language you want to read. If the whole livestream is in one language, set <em>Source language</em> to it instead of <em>Detect automatically</em>; if speakers switch languages, keep Detect automatically." },
  { title: "Press Start", text: "Press <strong>Start</strong> (shortcut ⌃⌥T, Windows: Ctrl+Alt+T) before the livestream plays or as it starts. The app loads its models in the first few seconds (the first run after installing or updating can take longer, up to a few minutes)." },
  { title: "Place the subtitle bar", text: "Drag the bar just under the video, set the text size and colors in Settings › Subtitles, then click <em>Lock (click-through)</em> so the mouse passes through the bar." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Tips", title: "You often can't rewind a livestream: settings that help" })}
${checkList([
  "<strong>Pick the source Only {app name} (macOS):</strong> so system notifications are not translated, start the livestream first, then in Settings › Audio click <em>Refresh list</em> (it only lists apps playing sound), choose the browser that plays the livestream and only then press Start. For Safari the entry is named <em>Only Safari and web pages inside other apps</em>. A new source applies from the next session. The other tabs of that browser are still heard, so mute them.",
  "<strong>Windows cannot pick a single app yet:</strong> mute system notifications while you watch.",
  "<strong>Pause that ends a sentence</strong> ranges from 50 to 800 ms: shorter shows subtitles sooner, longer cuts sentences less often. If sentences get cut in the middle (the speaker hesitates or pauses for breath), try raising it; the change applies from the next session.",
  "<strong>Missed a sentence?</strong> With the bar locked, press ⌃⌥PageUp (Windows: Ctrl+Alt+PageUp) to see earlier sentences and ⌃⌥PageDown to come back; with the bar unlocked, scroll on it and click <em>Latest</em> to return to the live line. On every plan you can also view, search and copy the transcript of the latest session; starting a new session replaces it (<a href=\"/en/guide/history-and-export/\">history and export</a>).",
])}
${callout({ title: "Quota for long livestreams.", text: "Minutes count only translated speech, not silence, and sentences already in the language you want to read are not counted. Free gives 30 minutes a day for a 10-day trial, so a long livestream needs Monthly (50 hours per 30 days), 6 Months (100 hours per 30 days) or Yearly (unlimited). See <a href=\"/en/pricing/\">pricing</a>." })}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "Honest limits", title: "When is AI Translator not the right fit for a livestream?", text: "Knowing the limits up front saves you a trial." })}
${checkList([
  "<strong>You watch on a phone.</strong> AI Translator only runs on macOS and Windows, so it does not show subtitles inside a phone app. To use it, open the livestream on a computer.",
  "<strong>You are the one streaming and want to translate for your viewers.</strong> The app makes subtitles for the person using it to read, on a floating bar on their own computer. It does not add subtitles or a translated voice to your livestream.",
  "<strong>You need to record the livestream, download the video or create a subtitle file from a video file.</strong> The app does not record audio or video to disk and does not process video files; it only has a text transcript and no summary mode.",
  "<strong>The audio is unclear.</strong> Loud background music, noise or several people talking over each other make recognition worse and translations more likely to be wrong.",
  "<strong>You need speed on Windows or on a weaker machine.</strong> The 0.76–1.03-second delay was measured on a Mac M4 Pro with the Standard pack; Windows has only a preliminary measurement on one laptop with integrated graphics and is slower (<a href=\"/en/features/#performance\">test conditions</a>).",
  "<strong>The livestream is not in English, Chinese, Japanese, Korean or Vietnamese.</strong> The app supports only these five languages; a livestream in Thai, Indonesian or another language cannot be translated yet.",
], true)}
${callout({ kind: "warn", title: "Machine translation can be wrong.", text: "Do not rely on AI Translator for important decisions (purchases, contracts, medical, legal, financial) without checking with someone qualified." })}
<p>We have tested it with videos playing in a browser. We have not tested each livestream platform.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Frequently asked questions", title: "Livestream translation: common questions" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Keep reading", title: "Next steps", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/en/solutions/tiktok-live-translation/", icon: "play", title: "Translate TikTok Live", text: "How to watch TikTok Live in a desktop browser with translated subtitles, and its own limits.", more: "See the guide" })}
${linkCard({ href: "/en/solutions/webinar-and-video-translation/", icon: "book", title: "Webinars, courses and videos", text: "Recorded content in another language, including sessions that last hours.", more: "See the solution" })}
${linkCard({ href: "/en/guide/quick-start/", icon: "zap", title: "Quick start", text: "From installation to your first subtitles.", more: "Open the guide" })}
</div>
<p class="center-text reveal">Want to know whether your content is sent anywhere? See <a href="/en/data-security/">data and security</a>.</p>
<p class="disclaimer">TikTok, YouTube, Facebook and other product names belong to their respective owners; AI Translator is not affiliated with them.</p>
</div></section>

${ctaBand({ title: "Try it on your next livestream", text: "Install with one command and try Free for 10 days at 30 minutes a day. No card, no account.", primary: { href: "/en/download/", label: "Download" }, secondary: { href: "/en/pricing/", label: "See pricing" } })}
`,
};
