import { pageHero, sectionHead, feature, checkList, callout, ctaBand, appShot, overlayShot, facts, linkCard } from "../../build/components.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Solutions", path: "/en/solutions/" },
  { name: "Webinars and videos", path: "/en/solutions/webinar-and-video-translation/" },
];

export default {
  id: "solutions-webinar",
  lang: "en",
  path: "/en/solutions/webinar-and-video-translation/",
  title: "Translated subtitles for webinars, courses and video",
  description:
    "Read live translated subtitles while you watch webinars, courses and videos in another language with AI Translator: nothing to install in the browser, runs offline.",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "How to use AI Translator to read translated subtitles while watching webinars, courses and videos: nothing to install in the browser, long sessions, original text next to the translation, transcript export, glossary, tips and limits.",
  llmTitle: "Translated subtitles for webinars, courses and videos",
  body: () => `
${pageHero({
  crumbs,
  title: "Translated subtitles for webinars, courses and video",
  lead: "AI Translator shows translated subtitles on your screen while you watch a webinar, an online conference, a course or a video in another language. It listens to the audio playing on your computer, so there is nothing to install in your browser or on the platform, and both recognition and translation run on your machine.",
  meta: "<span>Updated 8 Oct 2026</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["Works with", "Anything that plays sound on your computer<small>Browsers, media players, course platforms, webinar tools</small>"],
  ["Extra installs", "None<small>No browser extension, no plugin, no sign-in account</small>"],
  ["Languages", "English, 中文, 日本語, 한국어, Tiếng Việt<small>You choose the language you want to read</small>"],
  ["Long sessions", "Ran for 5 hours 23 minutes without an error<small>Mac M4 Pro, macOS, ad-hoc signed release build, tested once</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Who it is for", title: "When the content is great but not in your language", center: true })}
<div class="grid grid-3">
${feature({ icon: "book", title: "Online learners", text: "Courses and lecture videos in English, Chinese, Japanese or Korean that you want to follow right now, without waiting for someone to translate them." })}
${feature({ icon: "users", title: "Conference followers", text: "Webinars and online conferences with speakers from abroad, where you only listen and do not need to speak." })}
${feature({ icon: "play", title: "Video watchers", text: "Technical videos, talks and interviews whose built-in captions do not come in your language." })}
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Nothing to install", title: "It works with any player" })}
<p>Because AI Translator captures the sound playing on your computer, it does not depend on the website or platform you are watching. Press <strong>Start</strong>, then play the video; translated subtitles appear on a floating bar above the player window. We have tested it with videos in a browser, but not with each individual course or webinar platform.</p>
<p>On macOS you grant the <em>System Audio Recording</em> permission once; the microphone is not used. See <a href="/en/guide/macos-audio-permission/">how to grant the permission</a>.</p>
</div></section>

<section class="section"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">Read both</span>
<h2>The original and the translation at once</h2>
<p>Turn on <em>Show the original text above the translation</em> in Settings › Subtitles to see the source sentence in small type right above the translation. It suits language learners and anyone who wants to double-check a term.</p>
${checkList([
  "Font size 14–48 px, 5 text colours, 5 background colours, adjustable opacity",
  "Scroll up to reread earlier sentences with the mouse wheel or a shortcut; the <em>Latest</em> button returns you to the live line",
  "<em>Pause that ends a sentence</em> ranges from 50 to 800 ms: when you are watching a video and do not need instant feedback, raise it so sentences get cut less often",
])}
</div>
<div>
${overlayShot({ slug: "overlay-custom", lang: "en", alt: "Customised subtitle bar: yellow text on a navy background, with the original sentence in small type above the Vietnamese translation", caption: "The same bar restyled: yellow text on a navy background." })}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Long sessions", title: "Watch a whole long event without interruptions" })}
<p>One continuous session of <strong>5 hours 23 minutes</strong> (an English lecture video playing in a browser) finished with 6,019 segments, no errors, and a median delay of 0.48 seconds. Conditions: a Mac M4 Pro, macOS, an ad-hoc signed release build, run once; it was not a formal acceptance test. A separate 2-hour stability test did not restart any process either.</p>
${callout({ title: "Quota for long events.", text: "Minutes count only translated speech, not silence, and sentences already in the language you want to read are not counted, but a passage you rewind and hear twice is. Free gives 30 minutes a day for a 10-day trial, so a long webinar needs Monthly (50 hours per 30 days) or Yearly (unlimited). See <a href=\"/en/pricing/\">pricing</a>." })}
</div></section>

<section class="section"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-transcript", lang: "en", alt: "The transcript showing time, original text and translation, with a search box, a Copy all button and an export format picker", caption: "The transcript: search, copy, export as TXT, SRT or Markdown." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Study again</span>
<h2>Keep the transcript to review later</h2>
${checkList([
  "<strong>Copy all</strong> of the transcript (time, original, translation) works on every plan",
  "<strong>Exporting to TXT, SRT or Markdown</strong> and saving history are Pro features",
  "<strong>TXT and Markdown</strong> record the clock time of each sentence; <strong>SRT</strong> records time from the moment you pressed Start, and lets you choose the translation or the original as its text",
])}
<p class="small muted">SRT is not synced to your video. Only if you press Start exactly when the video plays from second 0 will the times roughly match; otherwise shift them with your own subtitle tool. See <a href="/en/guide/history-and-export/">history and export</a>.</p>
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Specialist courses", title: "A glossary for technical content" })}
<p>Medical, financial or programming courses are full of terms that a translator can easily get wrong. Add source → target pairs to the <strong>Glossary</strong> (Pro): up to 500 entries, CSV import and export, case-insensitive. The app passes matching terms to the translator as a hint, so they are not guaranteed every time. See the <a href="/en/guide/glossary/">glossary guide</a>.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Tips", title: "Make it smoother" })}
${checkList([
  "<strong>Pick the source Only {app name} (macOS):</strong> in Settings › Audio, choose your browser or media player so other sounds are not translated. The list only shows apps playing sound, so start the video first, then click <em>Refresh list</em>.",
  "<strong>Mute system notifications</strong> while you watch, especially on Windows (coming soon), where you cannot pick a single app yet.",
  "<strong>Lock the source language</strong> when the whole event is in one language; keep Detect automatically when speakers switch.",
  "<strong>Press Start before you play:</strong> the app loads its models during the first few seconds.",
])}
<p>All five languages work in every direction. We have only measured translation quality for pairs that include Vietnamese; other pairs (for example English to Japanese) run, but have no quality score yet.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Honest limits", title: "What to keep in mind" })}
${checkList([
  "<strong>Translations can be wrong,</strong> especially jargon, proper names and unclear speech. Do not rely on them for important decisions without checking.",
  "<strong>Latency</strong> is a median of 0.76–1.03 seconds on a Mac M4 Pro with the Standard pack. Slower machines will be slower; we have not measured an M1 Mac. With a video you do not need to react to, delay matters less than in a meeting.",
  "<strong>Recognition</strong> is less accurate with the Lite pack in Vietnamese, Japanese, Korean and Chinese, and gets worse when speech is unclear, for example under loud music or noise.",
  "<strong>macOS only for now</strong> (Apple Silicon, 14.2+); Windows is coming. Translations appear only on the floating bar: they are not added to the video and do not replace the publisher's official subtitles.",
], true)}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Keep reading", title: "Next steps", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/en/guide/quick-start/", icon: "zap", title: "Quick start", text: "From installation to your first subtitles.", more: "Open the guide" })}
${linkCard({ href: "/en/solutions/online-meeting-translation/", icon: "users", title: "Online meetings", text: "For Zoom, Teams, Meet and Zalo.", more: "See the solution" })}
${linkCard({ href: "/en/features/", icon: "sliders", title: "Features", text: "Every feature and the performance measurements.", more: "See features" })}
</div>
<p class="center-text reveal">Wondering where your content goes? Read <a href="/en/data-security/">data and security</a>.</p>
</div></section>

${ctaBand({ title: "Try it on a video of your own", text: "Start with the free 10-day trial, 30 minutes a day. No card, no account.", primary: { href: "/en/download/", label: "Get the beta" }, secondary: { href: "/en/pricing/", label: "See pricing" } })}
`,
};
