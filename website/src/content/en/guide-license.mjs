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
    "Buy Monthly, 6 Months or Yearly by VietQR or international card in the app, enter your key, switch computers, renew, fix a failed order, refunds, locked keys.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-15",
  llm: "How to buy a Monthly, 6 Months or Yearly plan with VietQR or an international card inside the app (choose the Payment method), receive and enter the key, recover a lost key, one key per computer and how to switch computers, 14-day offline use, renewing, changing plan, a card order that did not go through or is past its payment time (if you paid, do not pay again) and the refund terms.",
  llmTitle: "Buy a plan, activate your key and switch computers in AI Translator",
  schema: [
    howTo({
      name: "Buy a plan and activate AI Translator",
      description: "Buy the Monthly, 6 Months or Yearly plan with VietQR or an international card inside the app and activate the key on your computer.",
      totalTime: "PT10M",
      steps: [
        { name: "Open Upgrade to Pro", text: "Click Upgrade to Pro in the sidebar to see the four plans. Buying needs an internet connection." },
        { name: "Choose the Payment method and a plan", text: "In step 1, Payment method, choose VietQR bank transfer (VND) or International card (USD); the app preselects one based on the interface language (VietQR in Vietnamese, international card in any other language), and you can change it. Then in step 2, Choose a plan, choose the Monthly, 6 Months or Yearly box; the prices follow your payment method." },
        { name: "Enter the email for your key", text: "In step 3, Checkout, enter your Email to receive your key, tick the agreement box (for an international card it also lets us share the email with Creem to pre-fill the payment page), then click Create payment QR code (VietQR) or Pay in your browser (international card)." },
        { name: "Pay", text: "VietQR: scan the code with a Vietnamese bank app within 15 minutes, or click Open payment page. International card: pay on the Creem payment page that the app opens in your browser, within 30 minutes (the app shows Finish paying before …). If you pay later and the page still accepts it, your key is still emailed; if you have paid, do not pay again." },
        { name: "Activate", text: "The app activates the plan when payment arrives. If needed, open Settings › License, paste the key from your email into the License key box and click Activate." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Buy a plan, activate your key and switch computers",
  lead: "You buy an AI Translator plan inside the app: choose Monthly, 6 Months or Yearly, pay by VietQR or international card, and your key arrives by email while the app activates the plan on the computer you are using. Each key works on one computer. To move to another computer, deactivate the old one and enter the key on the new one.",
  meta: `<span>Updated {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "On this page",
  body: `
${facts([
  ["Plans", "Monthly 50,000 ₫ or $3.99 (30 days, 50 hours)<small>6 Months 269,000 ₫ or $21.99 (180 days, 100 hours per 30 days)</small><small>Yearly 500,000 ₫ or $39.99 (365 days, unlimited)</small>"],
  ["Payment", "VietQR (Vietnamese banks, VND) or international card (USD, through Creem)<small>USD prices exclude tax · no auto-renewal</small>"],
  ["Computers", "One computer per key"],
  ["Offline", "Up to 14 days between license checks"],
  ["Refunds", "Payments are not refundable except in the cases set out in the Terms<small>Send a request within 7 days of payment</small>"],
])}

<h2 id="buy">Buy a plan in the app</h2>
<ol>
<li>Click <strong>Upgrade to Pro</strong> in the sidebar. The screen lists all four plans; yours is marked “Current”. Buying needs an internet connection.</li>
<li>The screen has three steps. In step 1, <strong>Payment method</strong>, choose <strong>VietQR bank transfer (VND)</strong> or <strong>International card (USD)</strong>; the note right below explains how that method works. The app preselects one based on the interface language (VietQR in Vietnamese, international card in English, Japanese, Chinese or Korean) and you can change it; the prices on the plan boxes follow your choice. If this step only offers VietQR, card payment is not available right now. Not seeing these steps? Update the app to the latest version.</li>
<li>Click the <strong>Monthly</strong>, <strong>6 Months</strong> or <strong>Yearly</strong> box in step 2, <strong>Choose a plan</strong> (the price is in large type and follows your payment method, e.g. “50.000 đ / 30 days” or “$3.99 / 30 days”; USD prices exclude tax); the selected box gets a blue outline.</li>
<li>In step 3, <strong>Checkout</strong>, enter your <strong>Email to receive your key</strong> and tick the agreement box: it lets the app store the email to send and recover your key; with an international card the sentence also says the email is sent to Creem to pre-fill the payment page; if you change the payment method, tick the box again. Below it are folded sections for the <strong>Privacy Policy</strong> and, with an international card, the <strong>License Agreement (EULA)</strong>, to read in the app. Then click <strong>Create payment QR code</strong> (VietQR) or <strong>Pay in your browser</strong> (international card).</li>
<li><strong>VietQR:</strong> scan the code with your banking app, or click <strong>Open payment page</strong> (PayOS, in your browser). The code works for 15 minutes; its expiry time is on screen.</li>
<li><strong>International card:</strong> the app opens the Creem payment page in your browser by itself and shows a <strong>Finish paying in your browser</strong> panel with the order number, the amount and the deadline as “Finish paying before …”. Pay within 30 minutes. If you pay later and the page still accepts it, the payment still counts: the app keeps waiting for confirmation and your key is also emailed, so do not pay again. Once paid, return to the app; if the browser did not open, click <strong>Reopen payment page</strong>. While the order is waiting, the payment method and plan are locked; if you have paid, do not click Cancel or create a new order.</li>
<li>Wait for the app to confirm (it checks the order every few seconds; for a card the status line says “Waiting for payment confirmation…”): “Payment received. Your plan is active on this computer, and the key is in your email.”</li>
</ol>
${appShot({
  slug: "app-upgrade",
  lang: "en",
  alt: "The Upgrade screen in English, with International card (USD) preselected: step 1 Payment method (VietQR bank transfer (VND), International card (USD) selected) with notes about Creem’s payment page and Creem as the merchant of record, step 2 Choose a plan with the Free, Monthly, 6 Months and Yearly plans, their quota and USD prices excluding tax, step 3 Checkout with the Email to receive your key box, the agreement tick box, the folded Privacy Policy and License Agreement (EULA) and the Pay in your browser button",
  caption: "The Upgrade screen.",
})}
${appShot({
  slug: "app-upgrade-qr",
  lang: "en",
  alt: "The Upgrade screen while a VietQR order is waiting: VietQR selected in step 1, the Monthly plan in step 2, and in step 3 a VietQR code drawn inside the app with the order number, the amount, the code’s expiry time, a status line waiting for the transfer, an Open payment page button and a Cancel button",
  caption: "The VietQR code in the app, with the order number.",
})}
${appShot({
  slug: "app-upgrade-card",
  lang: "en",
  alt: "The Upgrade screen while an international card order is waiting: International card (USD) selected in step 1, with two notes saying Creem’s payment page opens in your browser and Creem is the merchant of record; plan prices in USD excluding tax in step 2; in step 3 the Finish paying in your browser panel with the order number, the amount, the payment deadline, a Waiting for payment confirmation… line, a Reopen payment page button, a Cancel button and a reminder not to cancel or create a new order if you have already paid",
  caption: "A pending international card order in the app.",
})}
<p>VietQR works only with a Vietnamese bank account, in VND, through PayOS; if card payment is not available right now and you have no such account, contact support. Card prices are in USD, excluding tax (if any; Creem adds it on the payment page). Creem is the merchant of record for card orders and handles the payment, tax and receipt; your card statement usually shows “CREEM.IO* STORE”. See the <a href="/en/pricing/">pricing page</a> for prices and quotas.</p>

<h2 id="enter-key">Get your key by email and enter it</h2>
<p>The key is sent from no-reply@mail.aitranslator.vn to the email you entered. Keep that email for reinstalling or activating another computer; if it is missing, check your spam folder. A key has 7 groups of 4 characters: <code>XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX</code>.</p>
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
<p>Go to <strong>Settings › License › Lost your key?</strong>, enter the <strong>Email used to buy</strong> and click <strong>Send my keys</strong>. Every valid key of that email is sent to that same address. The app always says “If this email has a key, it is on its way.”, whether or not it has one. Still nothing? Write to support@aitranslator.vn.</p>

<h2 id="switch-computers">One key, one computer: how to switch</h2>
<p>Reinstalling the app on the same computer does not count as a new computer. Quota is counted per computer: what you used stays on the old one.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Situation</th><th scope="col">What to do</th></tr></thead>
<tbody>
<tr><th scope="row">You can still use the old computer</th><td>On the old one, open <strong>Settings › License › Deactivate this computer</strong> and confirm with <strong>Deactivate</strong> (the red button in the light-red confirmation box). That computer goes back to Free. Then enter the key on the new one.</td></tr>
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
<li><strong>Renewing the same plan:</strong> adds 30 days (Monthly), 180 days (6 Months) or 365 days (Yearly), counted from the expiry date if the plan is still active.</li>
<li><strong>Changing plan while active:</strong> the new plan starts at once with a fresh quota cycle; the days left on the old plan are converted at the price per day and rounded down: <code>converted days = days left × (old price ÷ old days) ÷ (new price ÷ new days)</code>, where the old and new price are the prices of the two plans in the currency of the plan-change order (VND or USD).</li>
<li><strong>Expiry:</strong> the computer returns to Free if still within its 10-day trial, otherwise it cannot translate until you buy a plan. Pro features are locked.</li>
</ul>
<p>Price per day: Monthly 50,000 ÷ 30 ≈ 1,667 ₫, 6 Months 269,000 ÷ 180 ≈ 1,494 ₫, Yearly 500,000 ÷ 365 ≈ 1,370 ₫. Example, priced in VND: with 20 days of Monthly left, buying Yearly adds 20 × 1,667 ÷ 1,370 ≈ 24 days, so Yearly runs 365 + 24 = 389 days; buying 6 Months adds 20 × 1,667 ÷ 1,494 ≈ 22 days, so 6 Months runs 180 + 22 = 202 days. The other way, with 200 days of Yearly left, buying Monthly adds ≈ 164 days, so Monthly runs 30 + 164 = 194 days. Because the formula uses the prices of both plans in the currency of the plan-change order (VND or USD), paying in USD can give different days: in these examples by at most one day, but with more days left it can differ by several days (with 180 days of 6 Months left, buying Monthly adds 161 days when paying in VND and 165 days when paying in USD). The app shows the converted days and the new expiry date (an estimate) before you pay, with “No refunds.”</p>

<h2 id="refunds">Payment problems, refunds and invoices</h2>
<ul>
<li><strong>VietQR order:</strong> “The amount received is less than the price. Transfer the rest for order … within 24 hours, or contact support with this order number.” Transfer the difference, or contact support.</li>
<li><strong>A card order paid short</strong> (the amount received is less than the plan price): the app says “Payment received; support is reviewing order …. Contact support with this order number if needed.” It means the operator has to review the order; do not pay more.</li>
<li>“Payment received, but the key could not be activated here…” Enter the key from your email in Settings › License.</li>
<li>You paid by card but the app still says “Waiting for payment confirmation…”: wait a few minutes (our server asks Creem again on a schedule), then check your email for the key. If there is still none, contact support with the order number and your Creem receipt.</li>
<li><strong>A card order that did not go through or is past its payment time.</strong> The app says “Order … did not go through. If you have paid, your key will be sent by email; do not pay again. If needed, contact support with this order number.” or “The payment time has passed. If you have paid, the app still activates your plan once Creem confirms, and your key is also sent by email; do not pay again.” If you paid by card, do not pay again: your key is still emailed; enter it in Settings › License, or contact support with the order number and your Creem receipt (your card statement usually shows “CREEM.IO* STORE”; look up your order at creem.io/my-orders/login). If you have not paid, creating a new order is fine.</li>
<li><strong>Cancelling a card order.</strong> While the order is waiting, the app says under the two buttons: “If you have already paid on the payment page, do not cancel or create a new order: your key will be sent by email. After cancelling, do not pay on the old page.” In short: if you have paid, do not click Cancel; if you have cancelled, do not pay on that order’s payment page, create a new order instead.</li>
</ul>
<p>Payments are not refundable, except where our fault leaves you unable to use the plan you bought and we cannot fix it within a reasonable time, or where the law says otherwise. Send your request to us first, within 7 days of the payment date, to support@aitranslator.vn with your <strong>order number</strong> (shown on the Upgrade screen as “Order …”); changing plan is not refundable. Card orders: Creem is the merchant of record and emails the receipt to the address you entered; Creem may also refund under Creem’s terms (if we do not reply for more than 7 days, you can contact Creem; look up your order at creem.io/my-orders/login). When an order is refunded (in full or in part, including through a card dispute), we may shorten the time that order added to your license, or revoke the license if it consists only of that order; this is not automatic: the operator decides case by case. VietQR orders have no electronic invoice yet; if you need a document, contact support to discuss it. Details are in the <a href="/en/terms/">Terms of use</a> and on the <a href="/en/contact/">contact page</a>.</p>
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
