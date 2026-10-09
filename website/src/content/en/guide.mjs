import { pageHero, sectionHead, linkCard, callout, facts, icon } from "../../build/components.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
];

const MORE = "Read the guide";

export default {
  id: "guide",
  lang: "en",
  path: "/en/guide/",
  title: "AI Translator user guides: install, shortcuts, fixes",
  description:
    "Step-by-step AI Translator guides: install on macOS or Windows, audio permission, subtitle bar and shortcuts, glossary, history, buying a key and troubleshooting.",
  schemaType: "CollectionPage",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "Index of nine AI Translator user guides: quick start, macOS installation, Windows installation, macOS audio permission, subtitle bar and shortcuts, glossary, history and export, buying and activating a key, troubleshooting.",
  llmTitle: "AI Translator user guides",
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator user guides",
  lead: "Nine step-by-step guides for AI Translator, from installing on macOS or Windows to buying a key and fixing problems. Each one uses the exact button and menu names you see in the app, and most include screenshots of the real interface.",
})}

<section class="section-tight"><div class="container">
${callout({ title: "These guides cover both macOS and Windows.", text: "Most steps are the same on both systems. The main differences on Windows: you install from an .exe file and may need to get past a SmartScreen warning because the beta is not code-signed yet, there is no audio permission to grant, the icon sits in the system tray instead of the menu bar, and shortcuts use Ctrl+Alt instead of ⌃⌥. No installer yet? See <a href=\"/en/download/\">how to get the beta</a>." })}
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Get started", title: "From installer to your first subtitles" })}
<div class="grid grid-2">
${linkCard({ href: "/en/guide/quick-start/", icon: "play", title: "Quick start", text: "Seven one-time setup steps, then translate your first meeting, with screenshots of the app’s setup screens.", more: MORE })}
${linkCard({ href: "/en/guide/install-macos/", icon: "download", title: "Install on macOS", text: "Install with one command, or from the .dmg (drag to Applications, Open Anyway), verify the SHA-256 and uninstall.", more: MORE })}
${linkCard({ href: "/en/guide/install-windows/", icon: "download", title: "Install on Windows", text: "Requirements, verify the SHA-256, get past SmartScreen with Run anyway, first launch and uninstall.", more: MORE })}
${linkCard({ href: "/en/guide/macos-audio-permission/", icon: "mic", title: "Audio permission (macOS)", text: "Answer the System Audio Recording prompt, turn it back on in System Settings and choose the audio source.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Everyday use", title: "Get the most from the bar, glossary and transcript" })}
<div class="grid grid-3">
${linkCard({ href: "/en/guide/subtitle-bar-and-shortcuts/", icon: "captions", title: "Subtitle bar and shortcuts", text: "Move, lock, hide and scroll the bar, change font size and colors, the shortcut table and the menu bar menu.", more: MORE })}
${linkCard({ href: "/en/guide/glossary/", icon: "book", title: "Use the glossary", text: "Add names and terms, import and export CSV, and see why the glossary is a hint to the translator, not a guarantee.", more: MORE })}
${linkCard({ href: "/en/guide/history-and-export/", icon: "history", title: "History and exporting transcripts", text: "Turn on saved history, review past sessions, copy the transcript and export TXT, SRT or Markdown.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Plans and support", title: "Plans, keys and when something goes wrong" })}
<div class="grid grid-2">
${linkCard({ href: "/en/guide/buy-and-activate/", icon: "key", title: "Buy a plan, activate your key and switch computers", text: "Buy Monthly or Yearly with VietQR inside the app, enter your key, switch computers, renew and recover a lost key.", more: MORE })}
${linkCard({ href: "/en/guide/troubleshooting/", icon: "support", title: "Troubleshooting", text: "No subtitles, quota used up, a locked key, a failed model download: the cause and the fix for each.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container narrow">
${sectionHead({ title: "Find a guide by situation" })}
${facts([
  ["macOS blocks the app on first launch", "See <a href=\"/en/guide/install-macos/\">installing on macOS</a>, the First launch section"],
  ["Windows shows “Windows protected your PC”", "See <a href=\"/en/guide/install-windows/\">installing on Windows</a>, the Run the installer section"],
  ["You press Start and nothing appears", "See <a href=\"/en/guide/macos-audio-permission/\">audio permission</a>, then <a href=\"/en/guide/troubleshooting/\">troubleshooting</a>"],
  ["The subtitle bar vanished or will not respond", "See <a href=\"/en/guide/subtitle-bar-and-shortcuts/\">the subtitle bar and shortcuts</a>, the Show and hide and Lock sections"],
  ["You want to save or export a transcript", "See <a href=\"/en/guide/history-and-export/\">history and export</a>"],
  ["You need names and terms translated consistently", "See <a href=\"/en/guide/glossary/\">the glossary</a>"],
  ["You changed computers or lost a key", "See <a href=\"/en/guide/buy-and-activate/\">buy and activate a key</a>"],
])}
</div></section>

<section class="section-tight"><div class="container narrow">
<div class="card reveal">
<h2>Need help?</h2>
<p>Did not find your answer in the guides? Read the <a href="/en/faq/">frequently asked questions</a> or write to us on the <a href="/en/contact/">contact</a> page. You can write to <strong>support@aitranslator.io.vn</strong>.</p>
<p class="more-link"><a class="btn btn-secondary" href="/en/contact/">Contact support ${icon("arrow-right")}</a> <a class="btn btn-ghost" href="/en/faq/">FAQ</a></p>
</div>
</div></section>
`,
};
