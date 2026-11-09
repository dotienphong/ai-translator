import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Solutions", path: "/en/solutions/" },
  { name: "YouTube translation", path: "/en/solutions/youtube-translation/" },
];

const FAQ = [
  {
    q: "How does YouTube translation with AI Translator work?",
    a: `<p>Install AI Translator on your computer, open any YouTube video in your desktop browser (Chrome, Safari, Edge, Firefox), select your desired language in <em>Translate into</em>, and click <strong>Start</strong>. The app listens to the system audio output and generates real-time translated subtitles on a floating overlay, regardless of whether the video has creator-supplied subtitles.</p>`,
  },
  {
    q: "Can AI Translator translate YouTube Live streams in real time?",
    a: `<p>Yes. Because the app captures system audio directly from your machine, live broadcasts on YouTube Live are translated just like standard videos. We have tested it with videos playing in a browser, and once with YouTube Live (an English-language news channel, Chrome on macOS, 25 October 2026): translated subtitles appeared continuously throughout about 4 minutes of viewing with low latency.</p>`,
  },
  {
    q: "Does it work on the YouTube mobile app?",
    a: `<p>No. AI Translator runs exclusively on desktop computers running macOS (Apple Silicon) or Windows 10/11 x64. It is not available on mobile phones or tablets. To read translated subtitles, open YouTube in your computer's browser.</p>`,
  },
  {
    q: "Do I need to install a browser extension or plugin?",
    a: `<p>No. You do not need any browser extension or plugin, and AI Translator never requires access to your YouTube account. It operates as an independent desktop application capturing audio safely on your machine.</p>`,
  },
  {
    q: "Is YouTube translation with AI Translator free?",
    a: `<p>The Free plan includes a 10-day trial with up to 30 minutes of translation per day (Google sign-in required, no credit card needed). After the trial, prepaid plans (Monthly, 6 Months, or Yearly) are available on our <a href="/en/pricing/">pricing page</a>.</p>`,
  },
];

export default {
  id: "solutions-youtube",
  lang: "en",
  path: "/en/solutions/youtube-translation/",
  title: "YouTube translation: subtitles for video & live",
  description:
    "Translate YouTube videos and live streams with real-time subtitles on your computer. On-device AI, no browser extensions needed. Free 10-day trial.",
  type: "article",
  published: "2026-11-09",
  breadcrumbs: crumbs,
  modified: "2026-11-09",
  llm: "How to get YouTube translation with real-time subtitles for videos and YouTube Live on desktop: four setup steps, comparison with native captions, tips for long sessions, honest limits (not on phones, does not download videos, no dubbing), and frequently asked questions.",
  llmTitle: "YouTube translation: live subtitles for videos & streams",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "YouTube translation: live subtitles for videos & streams",
  lead: "Watching online lectures, technical conferences, or international YouTube Live streams without subtitles in your language? AI Translator provides real-time YouTube translation directly on your computer screen. Running completely on-device, it captures desktop audio to produce floating bilingual subtitles—no browser extensions required, no video uploads, and complete data privacy.",
  meta: "<span>Updated {{updated}}</span><span>Runs on macOS and Windows computers, not on phones</span>",
})}

<section class="section-tight"><div class="container narrow">
${callout({ kind: "warn", title: "Before you try: desktop computers only.", text: "AI Translator is a desktop application for macOS and Windows; it is not on phones. Please open the YouTube video or live broadcast in a computer browser to read translated subtitles." })}
</div></section>

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["Works with", "YouTube videos and live streams in desktop browsers<small>Chrome, Safari, Edge, Firefox, and other desktop audio sources</small>"],
  ["Languages", "English, Chinese, Japanese, Korean, and Vietnamese<small>Supported across all directions with measured translation benchmarks</small>"],
  ["Latency", "Median 0.76–1.03 seconds<small>After speaker pause; measured on Mac M4 Pro with the Standard model pack</small>"],
  ["Processing", "100% on-device AI execution<small>Audio never leaves your computer; no browser extensions or plugins required</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Use cases", title: "When YouTube videos lack subtitles in your language", center: true })}
<div class="grid grid-3">
${feature({ icon: "book", title: "Educational tutorials & lectures", text: "Computer science, science, and university lectures in English, Japanese, Chinese, or Korean when the creator has not provided subtitles." })}
${feature({ icon: "users", title: "International news & podcasts", text: "Stay up to date with global news channels, industry interviews, and multi-hour tech podcasts with continuous real-time subtitles." })}
${feature({ icon: "play", title: "YouTube Live streaming events", text: "Follow international keynote presentations, live product launches, and creator streams in real time as they broadcast." })}
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Comparison", title: "How does it compare to YouTube's native auto-captions?" })}
<p>While YouTube provides automated captions for select videos, many foreign-language uploads lack translations into your target language, and auto-generated captions are frequently unavailable or delayed during live streams. YouTube translation with AI Translator offers substantial advantages:</p>
${checkList([
  "<strong>Works across all videos:</strong> Translates directly from the audio output of your computer, whether the channel author enabled captions or not.",
  "<strong>Full YouTube Live support:</strong> Generates real-time subtitles as streams broadcast, where YouTube's built-in captioning is often disabled or lagging.",
  "<strong>Customizable floating subtitle overlay:</strong> Move the subtitle bar anywhere across your display, adjust font sizes from 14 to 48 px, and customize text and background contrast.",
  "<strong>Bilingual reading mode:</strong> Display original speech in a compact font above large translated subtitles, making it ideal for language learners and terminology verification.",
])}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Getting started", title: "Four steps to enable YouTube translation" })}
${steps([
  { title: "Install and launch AI Translator", text: "Copy the installation command from the <a href=\"/en/download/\">Download</a> page into Terminal (macOS) or PowerShell (Windows). Set <em>Translate into</em> to your preferred language." },
  { title: "Open the YouTube video or live stream", text: "Open YouTube in any desktop browser (Chrome, Edge, Safari, Firefox) and start playing the video or live broadcast with audio enabled." },
  { title: "Press Start", text: "Click <strong>Start</strong> (shortcut ⌃⌥T, Windows: Ctrl+Alt+T). On macOS, grant the <em>System Audio Recording</em> permission on first launch (see <a href=\"/en/guide/macos-audio-permission/\">permission guide</a>). Models load within seconds." },
  { title: "Position the floating subtitle bar", text: "Drag the floating bar directly beneath the YouTube player window, configure text size in Settings › Subtitles, and click <em>Lock (click-through)</em> so clicks pass through seamlessly." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Viewing tips", title: "Tips for watching YouTube videos and live streams" })}
${checkList([
  "<strong>Isolate browser audio (macOS):</strong> To avoid translating incoming system notifications, open Settings › Audio, select <em>Only Google Chrome</em> (or your active browser), and then start translation.",
  "<strong>Tune sentence pause sensitivity:</strong> For slow-paced speakers or lecturers who frequently pause, increase the <em>Pause that ends a sentence</em> (50–800 ms) in Settings for smoother phrasing.",
  "<strong>Export transcripts for study:</strong> For long lectures, copy the full timestamped transcript or export to TXT and SRT formats for revision after viewing (see <a href=\"/en/guide/history-and-export/\">history and export</a>).",
  "<strong>Custom terminology dictionary:</strong> For specialized engineering or medical channels, add key phrases to the <em>Custom glossary</em> so the translator prioritizes industry-specific terms.",
])}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "Honest limits", title: "When is AI Translator not the right fit for YouTube?", text: "We clearly outline operational boundaries so you can decide if the tool matches your workflow." })}
${checkList([
  "<strong>You want to watch on mobile phones.</strong> AI Translator runs on macOS and Windows desktop systems; it is not on phones. Please use a desktop browser.",
  "<strong>You want to download translated video files.</strong> The software does not download videos, does not touch original files, and does not record video to disk; it only displays live subtitles during playback.",
  "<strong>You need voice dubbing or hardcoded subtitles.</strong> The app provides no dubbing and does not burn subtitles into video files; subtitles appear exclusively in the floating system overlay.",
  "<strong>The video is in an unsupported language.</strong> Translation is currently supported between English, Chinese, Japanese, Korean, and Vietnamese. Other languages are not supported at this time.",
  "<strong>Your hardware does not meet recommended specifications.</strong> The median latency of 0.76–1.03 seconds was measured on a Mac M4 Pro with the Standard model pack; slower PCs or integrated GPUs may experience higher delay.",
], true)}
${callout({ kind: "warn", title: "Automated translation may contain inaccuracies.", text: "AI subtitles are intended to assist real-time comprehension. Do not rely on automated translation for critical legal, financial, or medical decisions without expert review." })}
<p>We have tested it with videos playing in a browser, and once with YouTube Live: an English-language news channel watched in Chrome (Mac M4 Pro, 25 October 2026). Subtitles appeared throughout about 4 minutes of viewing, including with the audio source set to <em>Only Google Chrome</em>; the translation broadly matched the speech, with a few small errors. AI Translator is built specifically for real-time YouTube translation while watching on your computer.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "FAQ", title: "YouTube translation: frequently asked questions" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Keep reading", title: "Next steps", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/en/solutions/webinar-and-video-translation/", icon: "book", title: "Webinars and videos", text: "Translate recorded online courses, webinars, and long-form instructional videos.", more: "View solution" })}
${linkCard({ href: "/en/solutions/livestream-translation/", icon: "play", title: "Livestream translation", text: "Learn how to follow multi-platform live streams with real-time floating subtitles.", more: "View solution" })}
${linkCard({ href: "/en/pricing/", icon: "wallet", title: "Pricing", text: "10-day Free trial; flexible prepaid Monthly, 6 Months, and Yearly plans.", more: "View pricing" })}
</div>
<p class="center-text reveal">Curious about how your data and audio are handled? See <a href="/en/data-security/">data and security</a>.</p>
<p class="disclaimer">YouTube is a trademark of Google LLC; AI Translator is not affiliated with Google or YouTube.</p>
</div></section>

${ctaBand({
  title: "Start YouTube translation with AI Translator",
  text: "Install with a single command line. Enjoy a 10-day Free trial on macOS and Windows, no credit card required.",
  primary: { href: "/en/download/", label: "Download now" },
  secondary: { href: "/en/pricing/", label: "View pricing" },
})}
`,
};
