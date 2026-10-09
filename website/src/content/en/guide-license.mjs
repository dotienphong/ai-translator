import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Buy a plan, activate your key and switch computers", path: "/en/guide/buy-and-activate/" },
];

const toc = [
  { level: 2, id: "buy", text: "Buy a plan in the app" },
  { level: 2, id: "enter-key", text: "Get and enter your key" },
  { level: 3, id: "lost-key", text: "Lost your key" },
  { level: 2, id: "switch-computers", text: "One key, one computer" },
  { level: 2, id: "offline", text: "Offline use and license checks" },
  { level: 2, id: "renew-change", text: "Renew, change plan, expiry" },
  { level: 2, id: "refunds", text: "Payment problems and refunds" },
];

export default {
  id: "guide-license",
  lang: "en",
  path: "/en/guide/buy-and-activate/",
  title: "Buy a plan, activate your key, switch computers",
  description:
    "Buy Monthly or Yearly with VietQR in the app, enter your emailed key, switch computers, renew or change plan, check the refund terms and fix a locked key.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "How to buy a Monthly or Yearly plan with VietQR inside the app, receive and enter the key, recover a lost key, one key per computer and how to switch computers, 14-day offline use, renewing, changing plan and the refund terms.",
  llmTitle: "Buy a plan, activate your key and switch computers in AI Translator",
  schema: [
    howTo({
      name: "Buy a plan and activate AI Translator",
      description: "Buy the Monthly or Yearly plan with VietQR inside the app and activate the key on your computer.",
      totalTime: "PT10M",
      steps: [
        { name: "Open Upgrade to Pro", text: "Click Upgrade to Pro in the sidebar to see the three plans, then choose Monthly or Yearly." },
        { name: "Enter the email for your key", text: "Enter your email, tick the box agreeing that the app stores it to send and recover your key, then click Create payment QR code." },
        { name: "Scan the VietQR code", text: "Scan the code with a Vietnamese bank app within 15 minutes, or click Open payment page." },
        { name: "Activate", text: "The app activates the plan when payment arrives. If needed, open Settings › License, paste the key from your email into the License key box and click Activate." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Buy a plan, activate your key and switch computers",
  lead: "You buy an AI Translator plan inside the app: choose Monthly or Yearly, scan a VietQR code, and your key arrives by email while the app activates the plan on the computer you are using. Each key works on one computer. To move to another computer, deactivate the old one and enter the key on the new one.",
  meta: `<span>Updated {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "On this page",
  body: `
${facts([
  ["Plans", "Monthly 50,000 ₫ (30 days, 50 hours)<small>Yearly 500,000 ₫ (365 days, unlimited)</small>"],
  ["Payment", "VietQR, Vietnamese banks, VND<small>No international cards, no auto-renewal</small>"],
  ["Computers", "One computer per key"],
  ["Offline", "Up to 14 days between license checks"],
  ["Refunds", "Payments are not refundable except in the cases set out in the Terms<small>Send a request within 7 days of payment</small>"],
])}

<h2 id="buy">Buy a plan in the app</h2>
<ol>
<li>Click <strong>Upgrade to Pro</strong> in the sidebar. The screen lists all three plans; yours is marked “Current”. Buying needs an internet connection.</li>
<li>Choose <strong>Monthly</strong> or <strong>Yearly</strong>.</li>
<li>Enter your <strong>Email to receive your key</strong>, tick the box that lets the app store this email to send and recover your key, then click <strong>Create payment QR code</strong>.</li>
<li>Scan the VietQR code with your banking app, or click <strong>Open payment page</strong> (PayOS, in your browser). The code works for 15 minutes; its expiry time is on screen.</li>
<li>Wait for the app to confirm (it checks the order every 3 seconds): “Payment received. Your plan is active on this computer, and the key is in your email.”</li>
</ol>
${appShot({
  slug: "app-upgrade",
  lang: "en",
  alt: "The Upgrade screen: the Free, Monthly and Yearly plans with their quota and price, the Email to receive your key box, the agreement tick box and the Create payment QR code button",
  caption: "The Upgrade screen.",
})}
${appShot({
  slug: "app-upgrade-qr",
  lang: "en",
  alt: "A VietQR code drawn inside the app with the order number, the code’s expiry time, an Open payment page button and a status line waiting for the transfer",
  caption: "The VietQR code in the app, with the order number.",
})}
<p>Payment is by bank transfer from a Vietnamese bank, in VND, through PayOS only. See the <a href="/en/pricing/">pricing page</a> for prices and quotas.</p>

<h2 id="enter-key">Get your key by email and enter it</h2>
<p>The key is sent from no-reply@mail.aitranslator.io.vn to the email you entered. Keep that email for reinstalling or activating another computer; if it is missing, check your spam folder. A key has 7 groups of 4 characters: <code>XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX</code>.</p>
<ol>
<li>Open <strong>Settings › License</strong>.</li>
<li>Under <strong>Activate a key</strong>, paste the key into the <strong>License key</strong> box (dashes, spaces and letter case do not matter).</li>
<li>Click <strong>Activate</strong>.</li>
</ol>
<p>The app checks the key on your computer; a typo gives “This key is not valid. Check it for typos.” Once active, the app shows the key masked; the full key stays in your email. To enter a different key, first click <strong>Deactivate this computer</strong>. Keep your key private.</p>
${appShot({
  slug: "app-settings-license",
  lang: "en",
  alt: "The License group in Settings after activation: the Monthly plan in use, the key masked with only the last group visible, the expiry date, the minutes left, the Renew or change plan, Check now and Deactivate this computer buttons, and the Lost your key? section",
  caption: "Settings › License after activation.",
})}
<h3 id="lost-key">Lost your key</h3>
<p>Go to <strong>Settings › License › Lost your key?</strong>, enter the <strong>Email used to buy</strong> and click <strong>Send my keys</strong>. Every valid key of that email is sent to that same address. The app always says “If this email has a key, it is on its way.”, whether or not it has one. Still nothing? Write to support@aitranslator.io.vn.</p>

<h2 id="switch-computers">One key, one computer: how to switch</h2>
<p>Reinstalling the app on the same computer does not count as a new computer. Quota is counted per computer: what you used stays on the old one.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Situation</th><th scope="col">What to do</th></tr></thead>
<tbody>
<tr><th scope="row">You can still use the old computer</th><td>On the old one, open <strong>Settings › License › Deactivate this computer</strong> and confirm with <strong>Deactivate</strong>. That computer goes back to Free. Then enter the key on the new one.</td></tr>
<tr><th scope="row">The old computer is broken or out of reach</th><td>On the new one, enter the key. The app shows the computer holding it and a <strong>Remove that computer and use this one</strong> button.</td></tr>
<tr><th scope="row">You click <strong>Activate on this computer anyway</strong></th><td>The key is locked on both computers until one removes it. The app asks you to confirm first.</td></tr>
</tbody></table></div>
<p>When a key is locked, the License group shows a <strong>Locked</strong> badge, the message “This key is in use on 2 computers, so it is locked. Remove it from one computer to keep using it.” and both computers. Click <strong>Remove the key from this computer</strong> or <strong>Remove that computer</strong>, then <strong>Try again</strong>. While locked, the paid plan does not work on either computer.</p>
${callout({
  kind: "warn",
  title: "Do not switch back and forth.",
  text: "Changing computers many times within 30 days can lock the key: “This key is temporarily locked because computers were changed too often. Please contact support.”",
})}

<h2 id="offline">Offline use and license checks</h2>
<p>Speech recognition and translation need no connection. A paid plan only needs to be checked online at least every 14 days. After 14 days without a successful check the app falls back to Free (if the computer is still within its 10-day trial; after the trial it cannot translate until the license can be checked again) and says “Your plan could not be checked for 14 days, so Free is used. Connect to the internet.” Connect, then click <strong>Check now</strong> in Settings › License. A clock moved backwards also triggers an error; see <a href="/en/guide/troubleshooting/">troubleshooting</a>.</p>

<h2 id="renew-change">Renew, change plan and expiry</h2>
<ul>
<li><strong>No auto-renewal.</strong> The app warns “Your plan ends within 7 days. Renew it to keep the Pro features.” Click <strong>Renew or change plan</strong> in Settings › License.</li>
<li><strong>Renewing the same plan:</strong> adds 30 days (Monthly) or 365 days (Yearly), counted from the expiry date if the plan is still active.</li>
<li><strong>Changing plan while active:</strong> the new plan starts at once with a fresh quota cycle; the days left on the old plan are converted at the price per day and rounded down: <code>converted days = days left × (old price ÷ old days) ÷ (new price ÷ new days)</code>.</li>
<li><strong>Expiry:</strong> the computer returns to Free if still within its 10-day trial, otherwise it cannot translate until you buy a plan. Pro features are locked.</li>
</ul>
<p>Price per day: Monthly 50,000 ÷ 30 ≈ 1,667 ₫, Yearly 500,000 ÷ 365 ≈ 1,370 ₫. Example: with 20 days of Monthly left, buying Yearly adds 20 × 1,667 ÷ 1,370 ≈ 24 days, so Yearly runs 365 + 24 = 389 days. The other way, with 200 days of Yearly left, buying Monthly adds ≈ 164 days, so Monthly runs 30 + 164 = 194 days. The app shows the converted days and the new expiry date (an estimate) before you pay, with “No refunds.”</p>

<h2 id="refunds">Payment problems, refunds and invoices</h2>
<ul>
<li>“The amount received is less than the price. Transfer the rest for order … within 24 hours, or contact support with this order number.” Transfer the difference, or contact support.</li>
<li>“Payment received, but the key could not be activated here…” Enter the key from your email in Settings › License.</li>
</ul>
<p>Payments are not refundable, except where our fault leaves you unable to use the plan you bought and we cannot fix it within a reasonable time, or where the law says otherwise. Send a request within 7 days of the payment date to support@aitranslator.io.vn with your <strong>order number</strong> (shown on the Upgrade screen as “Order …”); changing plan is not refundable. E-invoices are not available yet; if you need a document, contact support to discuss it. Details are in the <a href="/en/terms/">Terms of use</a> and on the <a href="/en/contact/">contact page</a>.</p>
`,
})}
${docNav(
  [
    { href: "/en/guide/history-and-export/", kicker: "Previous", title: "History and exporting transcripts" },
    { href: "/en/guide/troubleshooting/", kicker: "Next", title: "Troubleshooting" },
  ],
  "Related guides",
)}
</div></section>
`,
};
