import { pageHero, callout, appShot, overlayShot, keys, docLayout, docNav } from "../../build/components.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Subtitle bar and shortcuts", path: "/en/guide/subtitle-bar-and-shortcuts/" },
];

const toc = [
  { level: 2, id: "move-and-resize", text: "Move and resize" },
  { level: 2, id: "lock", text: "Lock and unlock" },
  { level: 2, id: "show-hide", text: "Show and hide" },
  { level: 2, id: "scroll", text: "Scroll back through sentences" },
  { level: 2, id: "style", text: "Font size, colors, opacity" },
  { level: 2, id: "indicators", text: "Indicators on the bar" },
  { level: 2, id: "shortcuts", text: "Default shortcuts" },
  { level: 2, id: "change-shortcuts", text: "Change a shortcut" },
  { level: 2, id: "menu-bar", text: "The menu bar and tray menu" },
  { level: 2, id: "closing-the-window", text: "Why closing the window does not quit" },
];

export default {
  id: "guide-subtitle-bar",
  lang: "en",
  path: "/en/guide/subtitle-bar-and-shortcuts/",
  title: "AI Translator subtitle bar and shortcuts",
  description:
    "Move, lock, hide and scroll the AI Translator subtitle bar, set font size, colors and opacity, and learn the default macOS and Windows shortcuts and menu bar menu.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Using the subtitle bar: move, resize, lock (click-through), show/hide, scroll back; font size, colors and opacity; default macOS and Windows shortcuts; changing shortcuts; the menu bar menu.",
  llmTitle: "The subtitle bar and shortcuts",
  body: () => `
${pageHero({
  crumbs,
  title: "The subtitle bar and shortcuts",
  lead: "The subtitle bar is a floating window that stays on top and shows the translation without taking focus from your meeting app. Drag it to move it, drag an edge to resize it, lock it so the mouse passes through, and control it with five default shortcuts such as ⌃⌥T (start or stop) and ⌃⌥H (show or hide).",
  meta: "<span>macOS and Windows</span> <span>Updated October 8, 2026</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "In this guide",
  body: `
<h2 id="move-and-resize">Move and resize</h2>
<p>While the bar is unlocked, drag anywhere on it to move it. Drag an edge or a corner to resize it; the smallest size is 320 × 80. The app remembers the position and size separately for each screen. By default the bar sits in the middle of the screen, near the bottom edge.</p>
${overlayShot({ slug: "overlay-default", lang: "en", alt: "Default subtitle bar: white text on a translucent black background, original sentence in small type above the translation", caption: "The default subtitle bar (a dashed outline shows while it is unlocked)." })}

<h2 id="lock">Lock and unlock (click-through)</h2>
<p>Lock the bar so the mouse passes straight through it and it never blocks the buttons or the chat box of your meeting. When locked, the bar has no outline and no buttons.</p>
<ul>
<li>On the main screen, in the <strong>Subtitle bar</strong> card: click <strong>Lock (click-through)</strong> or <strong>Unlock</strong>.</li>
<li>The shortcut ${keys(["⌃", "⌥", "L"])}.</li>
<li>The menu bar menu: <strong>Lock subtitles (click-through)</strong> or <strong>Unlock subtitles</strong>.</li>
</ul>
${overlayShot({ slug: "overlay-locked", lang: "en", alt: "Locked subtitle bar with no outline and no buttons, showing the translation over a meeting background", caption: "A locked bar: clean, no buttons, clicks pass through." })}
${callout({ title: "You cannot click a locked bar.", text: "To unlock it, use the shortcut, the menu bar menu or the button on the main screen." })}

<h2 id="show-hide">Show and hide</h2>
<p>Hover over an unlocked bar to reveal the <strong>✕</strong> button in the top-right corner (“Hide subtitles”). Hiding the bar does not stop the translation and does not quit the app. You can also hide or show it with ${keys(["⌃", "⌥", "H"])}, with the <strong>Hide</strong> or <strong>Show</strong> button on the main screen, or from the menu bar menu. The bar starts hidden when you open the app, appears when you click Start, and keeps its last lines when you click Stop.</p>

<h2 id="scroll">Scroll back through sentences</h2>
<p>The bar keeps up to the last 1000 sentences of the session. While you are at the bottom, it follows new sentences by itself. Scroll up with the mouse wheel or trackpad (while unlocked) and it stops following and shows a <strong>↓ Latest</strong> button in the bottom-right corner; click it to return to the current sentence. When the bar is locked the mouse passes through, so use ${keys(["⌃", "⌥", "PageUp"])} and ${keys(["⌃", "⌥", "PageDown"])}, which scroll by about 80% of the bar's height; then the Latest label only signals that you are looking at older sentences. MacBook keyboards have no dedicated Page Up and Page Down keys; if they are awkward, change these two shortcuts.</p>

<h2 id="style">Font size, colors, opacity</h2>
<p>Open <strong>Settings › Subtitles</strong>. Every change shows on the bar at once; click <strong>Show</strong> on the Subtitle bar line to preview it when you are not translating.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Setting</th><th scope="col">Choices</th><th scope="col">Default</th></tr></thead>
<tbody>
<tr><th scope="row">Font size</th><td>14 to 48 px</td><td>20 px</td></tr>
<tr><th scope="row">Text color</th><td>White, Yellow, Green, Light blue, Orange</td><td>White</td></tr>
<tr><th scope="row">Background color</th><td>Black, Dark gray, Navy, Dark brown, Dark purple</td><td>Black</td></tr>
<tr><th scope="row">Background opacity</th><td>0 to 100% (0% is a transparent background, 100% is solid)</td><td>60%</td></tr>
<tr><th scope="row">Show the original text above the translation</th><td>On or off</td><td>On</td></tr>
</tbody></table></div>
<div class="grid grid-2">
${appShot({ slug: "app-settings-subtitles", lang: "en", alt: "Subtitles settings with a font size slider, two rows of color swatches, a background opacity slider and the show-original checkbox", caption: "Settings › Subtitles." })}
${overlayShot({ slug: "overlay-custom", lang: "en", alt: "Customized subtitle bar with yellow text on a navy background in a larger font", caption: "Example: yellow text, navy background, larger font." })}
</div>

<h2 id="indicators">Indicators on the bar</h2>
<p>The top-right corner of the bar holds a dot and a few short notes:</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">You see</th><th scope="col">It means</th></tr></thead>
<tbody>
<tr><th scope="row">A small green dot</th><td>Sound is coming in. With no sound the dot is a faint white. The dot only shows while a session is running</td></tr>
<tr><th scope="row">Loading models…</th><td>The first seconds of a session while the AI processing starts</td></tr>
<tr><th scope="row">Falling behind</th><td>Subtitles are later than the speech</td></tr>
<tr><th scope="row">No audio heard…</th><td>No sound for a while; check that the meeting is playing</td></tr>
<tr><th scope="row">Less than 5 minutes of translation left</th><td>You are close to your quota</td></tr>
<tr><th scope="row">Translation quota used up · resets …</th><td>The session stopped; the quota reopens at the time shown on the bar</td></tr>
</tbody></table></div>
<p>A lighter line is a provisional subtitle, replaced by the finished sentence when the speaker carries on. A small “not translated” tag marks a sentence the app could not translate.</p>

<h2 id="shortcuts">Default shortcuts</h2>
<p>Shortcuts work in every app, even when AI Translator is not the window in front.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Action</th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">Start or stop translating</th><td>${keys(["⌃", "⌥", "T"])}</td><td>${keys(["Ctrl", "Alt", "T"])}</td></tr>
<tr><th scope="row">Show or hide subtitles</th><td>${keys(["⌃", "⌥", "H"])}</td><td>${keys(["Ctrl", "Alt", "H"])}</td></tr>
<tr><th scope="row">Lock or unlock subtitles</th><td>${keys(["⌃", "⌥", "L"])}</td><td>${keys(["Ctrl", "Alt", "L"])}</td></tr>
<tr><th scope="row">Scroll subtitles up (older sentences)</th><td>${keys(["⌃", "⌥", "PageUp"])}</td><td>${keys(["Ctrl", "Alt", "PageUp"])}</td></tr>
<tr><th scope="row">Scroll subtitles down (newer sentences)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
</tbody></table></div>
<p class="small muted">On macOS, ⌃ is the Control key and ⌥ is the Option key (not Command).</p>

<h2 id="change-shortcuts">Change a shortcut</h2>
<ol>
<li>Open <strong>Settings › Shortcuts</strong>.</li>
<li>Click <strong>Change</strong> next to the action.</li>
<li>Press the new shortcut, or <strong>Esc</strong> to cancel.</li>
</ol>
<p>A new shortcut needs at least one of Ctrl, Alt or Cmd; Shift alone is not enough. The app says “This shortcut is already used for another action.” if you pick one of its own shortcuts, and “The system refused this shortcut; another app may be using it.” if the operating system declines it. We have not checked whether the default keys clash with shortcuts in Zoom, Teams or Meet; if you find a clash, change the shortcut here.</p>
${appShot({ slug: "app-settings-hotkeys", lang: "en", alt: "Shortcuts settings listing the five actions with their default macOS key combinations and a Change button", caption: "Settings › Shortcuts." })}

<h2 id="menu-bar">The menu bar and tray menu</h2>
<p>The AI Translator icon in the menu bar (a speech bubble with sound waves) lets you control the app without opening the main window. Hover over it to see the status, “Ready” or “Translating”.</p>
<p>On Windows, the icon (the app's color logo) sits in the system tray at the right end of the taskbar; Windows may hide it behind the <strong>^</strong> arrow. Right-click the icon to open the menu below; left-click it to open the main window.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Menu item</th><th scope="col">When it appears</th></tr></thead>
<tbody>
<tr><th scope="row">Start translating / Stop translating</th><td>Changes with the state</td></tr>
<tr><th scope="row">Show subtitles / Hide subtitles</th><td>Changes with the state</td></tr>
<tr><th scope="row">Lock subtitles (click-through) / Unlock subtitles</th><td>Changes with the state</td></tr>
<tr><th scope="row">Open main window</th><td>Always</td></tr>
<tr><th scope="row">Restart to update</th><td>When an update has been downloaded and the app is not translating</td></tr>
<tr><th scope="row">Quit</th><td>Always; stops a running session, then quits for good</td></tr>
<tr><th scope="row">Some shortcuts could not be registered</th><td>Only when a shortcut failed</td></tr>
</tbody></table></div>

<h2 id="closing-the-window">Why closing the window does not quit the app</h2>
<p>AI Translator is designed to live in the menu bar (macOS) or the system tray (Windows) so its shortcuts and a running session keep working after you close the main window. The close button only hides the window. On a Mac, ⌘Q does not quit either: the app brings the main window back with the note “AI Translator keeps running in the menu bar. To quit, choose Quit from the menu bar icon.” To quit completely, choose <strong>Quit</strong> from the icon in the menu bar or the system tray.</p>
<p>Something not working? See <a href="/en/guide/troubleshooting/">troubleshooting</a>. For an overview, see the <a href="/en/features/">features</a> page.</p>

${docNav(
  [
    { href: "/en/guide/macos-audio-permission/", kicker: "Previous", title: "Grant system audio recording permission on macOS" },
    { href: "/en/guide/glossary/", kicker: "Next", title: "Use the glossary" },
    { href: "/en/guide/troubleshooting/", kicker: "Related", title: "Troubleshooting" },
  ],
  "Related guides",
)}
`,
})}
</div></section>
`,
};
