# AI Translator Privacy Policy

**Version 1.6, effective 23 October 2026. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**

## 1. Who is responsible for your data

AI Translator (the "app") is developed and operated by **Do Tien Phong** (an individual) ("we", "us"). Contact for privacy and personal-data matters: **support@aitranslator.io.vn**.

## 2. Summary

- Meeting audio is processed **entirely on your computer**. Audio is **never** sent anywhere and is not written to disk.
- Text you type in **Type & Translate** (a box for writing a message, translating it and pasting it into another app) is also translated **entirely on your computer**: it is not sent anywhere and not written to disk (section 3).
- The app has **no sign-in accounts, no advertising and no analytics**. When it hits an error, it **automatically sends us an error report with personal data scrubbed out** so we can fix the problem; you can turn this off at any time (section 10).
- If you write to us in the **support chat** (on the website or in the app), your messages are stored on our server, forwarded to the operator's Zalo account so they can reply, and **deleted automatically 90 days** after the last message; you can delete them sooner yourself (section 11).
- Our servers only store your **email** (when you buy a plan, or when you choose to leave it in the support chat), order details, your license, a hashed machine identifier, error reports (kept for 30 days) and support chat messages (kept for 90 days), in order to issue keys, check licenses, make sure each machine gets the Free trial only once, fix bugs and reply to you.
- Personal data on our servers is **kept until you ask us to delete it** (section 7), except error reports, which are deleted automatically after 30 days (section 10), and support chat messages, which are deleted automatically 90 days after the last message (section 11).

## 3. Data that stays on your computer

| Data | How it is handled |
|---|---|
| System audio being captured | Held only in RAM while translating; never written to disk or sent over the network |
| Transcripts and translations | Shown on screen. **History is off by default.** If you turn it on, it is stored on your computer, encrypted, and can be deleted with one button |
| Text you type in Type & Translate and its translation | Held only in RAM until you paste it or quit the app; never written to disk, never sent over the network, not in logs or error reports. The app copies the translation to the operating system's clipboard to paste it; it stays there until you copy something else |
| Glossary, settings | Stored on your computer |
| History encryption key, license token, trial token, usage counters | Stored in the operating system's key store (macOS Keychain, Windows Credential Manager) |
| Activity logs | Stored on your computer; they do not contain transcript text. Only the part of a log that relates to an error leaves your computer, inside an error report with personal data scrubbed out (section 10); you can also send a log to support with a button in the app |
| Recognition and translation models | Downloaded once, then run entirely on your computer |

The app's helper programs only listen on `127.0.0.1` (your own machine) or open no network port at all.

On macOS, Type & Translate can ask for the **Accessibility** permission to paste the translation into the box you are typing in. The app uses this permission only to send the paste keys (⌘V); it does not read text, content or the clipboard of other apps. If you do not grant it, the app only copies the translation to the clipboard for you to paste.

## 4. When the app uses the network

The app connects to the network only to:
1. **Download models** and check for new model versions (from `releases.aitranslator.io.vn`).
2. **Check for app updates** (from `releases.aitranslator.io.vn`).
3. **Talk to our license server** (`api.aitranslator.io.vn`): when registering the Free trial (the first time you open the app, right after you accept the terms; this sends a hash of the machine ID), when you buy a plan, activate or deactivate, recover a key, check your license periodically, send error reports (section 10) and (rarely) ask for the server's time when your computer's clock looks wrong. Asking for the time sends none of your data. When you use the **support chat**, the app also sends and receives chat messages through this server (section 11): only while the Support screen is open, or while you are waiting for a reply to a message you sent in the last 24 hours and the app is not translating; if you have never used the chat, the app makes no connection for it. While translating, the app sends or receives chat messages only when the Support screen is open or when you press send.
4. **The payment page** provided by PayOS (VietQR bank transfer) or Creem (international card), opened in your browser when you buy a plan.
5. **Our website** `aitranslator.io.vn`, opened in your browser when you click a link in the app.

There are no other connections, and none carries audio, transcript text or text you type in Type & Translate.

## 5. Data we store on our servers

Our servers store the data below. The "Free trial" row applies to every machine that has opened the app with a network connection; the other rows only apply when you buy a plan or activate a key, except the "Error reports" row, which applies to every machine whose app sends a report, and the "Support chat" row, which applies to everyone who writes in the support chat on the website or in the app:

| Data | Purpose |
|---|---|
| The email you enter when buying | Send your key and recover it if you lose it, and, for card orders, pre-fill Creem's payment page |
| When you consented to us processing your email | Proof that you consented |
| Orders: order code, plan, amount and currency, payment time, status, the payment gateway's session ID (PayOS or Creem), the app's interface language at purchase | Issue and renew licenses; reconciliation; accounting obligations; email you in your language |
| License: key, plan, expiry date, usage cycle | Grant the paid plan |
| Free trial: a **hash** of the machine ID, when the trial started and ends, the app's last call | Each machine gets the 10-day trial only once, even after reinstalling the app |
| Activated machines: a **hash** of the machine ID, the computer name (`device_label`) and the last license check | Enforce one machine per key, prevent abuse, help you recognize a machine to remove |
| A change log of licenses (who did what, when) | Support, fraud prevention, incident investigation |
| Rate-limit counters (only HMAC hashes of IP, key, email, chat conversation; expire after about 3 hours) | Block key guessing and spam |
| Error reports (section 10): error type and code, machine details, a **hash** of the machine ID and the relevant part of the log; no email, computer name or meeting content | Find and fix bugs; deleted automatically after 30 days |
| Support chat (section 11): the text of your messages and our replies, their times, the source (website or app), the language, the page you were on when you opened the chat (website), the machine details line if you left it ticked (app), your email if you chose to leave it, a **hash** of the chat's secret code; no IP address is stored with the chat | Reply to you, and email you our reply if you left an email; deleted automatically 90 days after the last message |

We do **not** receive your bank account, card number or financial details (a bank transfer is handled by your bank and PayOS; a card payment is handled by Creem on Creem's own payment page). With VietQR we do **not** send your email to PayOS. With an international card we send the email you entered in the app to Creem, to pre-fill the payment page and so that Creem can email you a receipt. Our server guesses your country from your IP address (via Cloudflare) only to pre-select a payment method on the Upgrade screen; the guessed country is not stored. If you only use the Free plan and never buy or activate a key, we store only the "Free trial" row above, error reports if the app sends any, and your support chat if you write in it: no email (except one you choose to leave in the chat), computer name or any other information about you.

## 6. Third parties that process data, and transfers abroad

| Party | Role | Data |
|---|---|---|
| **PayOS** (Vietnam) | Processes VietQR bank-transfer payments | Order code, amount, order description. Not your email |
| **Creem** (Armitage Labs OÜ, Estonia) | Merchant of record (reseller) for card orders: handles the payment, tax and receipt | We send the order code, plan, amount, currency and the email you entered as soon as you click to pay by card (even if you then do not pay), to pre-fill the payment page and so that Creem can email you a receipt. On its payment page, Creem itself collects your card number, name, billing address and country (to calculate tax) and IP address (to prevent fraud); we do not receive your card number. Creem processes that data under its own policy (https://www.creem.io/privacy). The payment notification Creem sends to our server includes the buyer's name and country; we do not store these two items |
| **Cloudflare** | Hosts the license server, database, and the storage and delivery of updates and models | The data in section 5, including error reports (section 10) and the support chat (section 11); technical logs that expire on their own |
| **Resend** | Sends the email containing your key, and the email containing our support chat reply when you left an email | Your email and the message (including the key, or our chat reply); retention per Resend's own policy |
| **Zalo** (VNG Corporation, Vietnam; servers in Vietnam) | Carries your support chat messages to the operator's Zalo account and carries the operator's replies back to our server | The message text, the chat code (3 characters), the source (website or app), the language, the page you were on (website), the machine details line if you left it ticked (app), and notices that you left an email or deleted the chat. **Not your email** and not your IP address. Zalo processes this data under its own terms and policy |

Cloudflare and Resend operate servers outside Vietnam and Creem is an Estonian company, so the data in sections 5, 10 and 11 may be processed abroad; Zalo's servers are in Vietnam. By buying a plan and consenting to email processing, or by sending a message in the support chat, you agree to this. We do not sell your data or share it for advertising.

## 7. Retention and your rights

**Personal data on our servers is kept until you ask us to delete it.** We do not delete it automatically, except error reports (deleted after 30 days, section 10) and the support chat (deleted 90 days after the last message, section 11).

You have the right to know what is stored, to request **deletion** or **anonymization**, to withdraw consent, and to complain under Vietnam's **Law on Personal Data Protection**. Send requests to **support@aitranslator.io.vn** from the email you used when buying, or the email you left in the support chat (so we can confirm it is you). We respond within the period required by law.

When you ask for deletion we will:
- **remove** your email and computer name, and the interface language stored on your orders;
- **delete** the error reports of the machines that ever activated a key for that email (section 10);
- **delete** the support chats in which you left that email, both on our server and the copies forwarded into the operator's Zalo conversation (section 11);
- **keep** the hash of the machine ID (pseudonymous data, only to prevent abuse: one machine per key, the temporary lock for excessive machine switching, reusing the correct activation when you re-activate the same machine, one Free trial per machine);
- **keep** the time you consented to email processing (proof of earlier consent);
- **keep** the order row at the level accounting requires: order code, date, amount (and currency), the payment gateway's session ID.

After deletion your license still works but **can no longer be recovered by email**. Data on your computer (history, settings) is deleted by you in the app ("Delete models and data") or by uninstalling.

Self-expiring technical data (rate-limit counters; Cloudflare logs) and Resend's mail logs are outside our deletion; their retention follows those parties' policies. Data you enter on Creem's page and the transaction records kept by Creem (as the merchant of record it must keep tax records) are outside a deletion request sent to us; to have them deleted at Creem, contact Creem. Error reports from a machine that never activated a key are not tied to any email, so they cannot be found by email; they are deleted automatically after 30 days. A support chat in which you left no email cannot be found by email either: delete it yourself with the button in the chat, or send a request with the approximate time and content of your messages so we can find it; otherwise it is deleted automatically 90 days after the last message (the copy forwarded into Zalo is deleted only when you ask).

## 8. Children

The service is for people aged **16 or over**. We do not knowingly collect data from children under 16; if you are a parent or guardian and believe your child gave us an email, contact us and we will delete it.

## 9. Security

Token-signing and payment keys live only on our servers (as secrets) and are not in the app. Connections to our servers use HTTPS. Administrative access is protected by a separate login. No system is perfectly secure; if an incident affects personal data we will notify as required by law.

## 10. Error reports

When the app hits an error, it **automatically sends us an error report** through our license server (`api.aitranslator.io.vn`) so we can find and fix the problem. This is **on by default**: the Terms step the first time you open the app has a pre-ticked box you can untick, and people who installed the app earlier have it on after updating to a version that includes this feature. You can turn it off or on again at any time in **Settings › Privacy › Send error reports automatically**; turning it off deletes any reports still waiting to be sent. You can also send a report yourself at any time with the **Send log to support** button on the About screen: it sends immediately, even if you turned automatic sending off, and gives you a **report code** to hand to support.

| What | Details |
|---|---|
| When it is sent automatically | When the app's previous run ended abruptly; when a translation session stops because of an error in the app (not errors caused by you or your environment, such as a missing recording permission, a used-up quota, an ended trial, no network or no disk space); or when one of the app's helper programs dies and is restarted automatically. A report is only sent while the app is not translating, and each machine sends at most 5 reports a day |
| The report contains | The report code, the type and code of the error, the time it happened; the app version, the operating system and its version, the architecture, the chip or CPU name, RAM, the type of GPU in use, the model pack, the name of your license plan (never the key), the interface language; a **hash of the machine ID**; and the part of the log that relates to the error (at most 64 KB) |
| The report does not contain | Audio, transcripts, translations, text typed in Type & Translate, license keys, tokens, email addresses, the computer name, the operating-system user name, IP addresses |
| Scrubbing | Before sending, the app removes personal folder paths, keys, tokens and email addresses from the log; if any sensitive pattern is left, the whole report is dropped. Our server checks again and rejects a report if anything is left |
| How it is tied to you | The machine-ID hash in the report is the same one we store for licensing and the Free trial (section 5), so we **can link a report to that machine's license and email** when handling a support request |
| How long it is kept | At most **30 days**, then deleted automatically; the server keeps at most 3,000 reports and deletes the oldest first |
| Who can see it | Only the operator of the app, through an admin page with its own login. The data is held on Cloudflare (section 6) |

- We use reports only to find and fix bugs; we do not use them for advertising, sell them or share them with anyone other than the processors in section 6.
- To have the reports of your machine deleted before the 30 days are up, ask for deletion under section 7: when we handle a deletion request by email, we also delete the error reports of the machines that ever activated a key for that email.
- If you would rather send nothing, untick the box at the Terms step or turn the switch off in Settings; the app keeps working fully with it off.

## 11. Support chat

You can write to us in the **support chat**: the chat button in the corner of every page of the `aitranslator.io.vn` website, or the **Support** screen in the app. No account is needed, and everyone can use it, including on the Free plan. Replies come from the operator of the app, not from a bot. Your messages go through our server (`api.aitranslator.io.vn`) to the operator's Zalo account; the operator replies in Zalo and the reply appears in your chat. You do not need Zalo.

| What | Details |
|---|---|
| What our server stores | The text of your messages and our replies and their times; the source (website or app) and the language; the page you were on when you opened the chat (website only, just the page path); the machine details line if you left it ticked (app only); your email if you chose to leave it; a **hash** of the chat's secret code (the server does not store the code itself) |
| Email | Optional. If you leave it, we use it only to email you our reply (through Resend, section 6) when our reply has not reached your chat after about 2 minutes (for example because you have closed the page or the app), and you can reply to that email. To remove your email, delete the conversation with the button in the chat, or ask under section 7. The email you enter in the email box is **never sent to Zalo** |
| Machine details (app) | The box to include machine details is ticked by default, can be unticked, is shown only before your first message and is sent only with your first message. The app shows the exact line before sending: app version, operating system and its version, chip or CPU, RAM, graphics card (Windows), license plan name, model pack, interface language. It **never** contains a license key, email, machine ID, computer name or operating-system user name |
| IP address | Not stored with the chat. Your IP is used only for rate limiting; the counters on our server store only a hash of the IP (section 5) |
| Sent to Zalo | The message text, the chat code (3 characters), the source, the language, the page (website), the machine details line if you left it ticked (app), and notices that you left an email or deleted the chat (without the email address). The operator's replies travel from Zalo back to our server |
| On your computer or browser | The chat's secret code and how far you have read: on the website, in your browser's storage (`localStorage`); in the app, in a file in the app's data folder. Anyone with this code can open the chat. Deleting the conversation also deletes the code |
| When it connects | Website: when you open the chat, the browser asks whether the chat is on; once you have a conversation, the browser checks for new messages while the chat is open, or while you are waiting for a reply to a message you sent in the last 24 hours; if you have not opened the chat, the browser makes no connection for it. App: as in section 4 (if you have not sent a message, nothing connects) |
| How long it is kept | The chat and all its messages are **deleted automatically 90 days** after the last message. You can delete it right away with the delete-conversation button in the chat |
| Who can see it | Only the operator of the app, who reads and replies in Zalo. The data is held on Cloudflare and Zalo (section 6) |

- The 90-day deletion and the delete button remove only the data on our server (the delete button also removes the code on your computer). Copies of the messages forwarded to Zalo stay in the operator's Zalo conversation, and on Zalo's systems under Zalo's policy, until the operator deletes them; to have those deleted too, ask under section 7. Reply emails we sent you stay in your mailbox and in Resend's mail logs.
- We use the chat only to reply to you; we do not use it for advertising, sell it or share it with anyone other than the processors in section 6.
- If you choose to attach logs in the app's chat, the app sends an error report like the **Send log to support** button (section 10) and then posts the report code in the chat.
- Do not send passwords, card numbers or bank account numbers in the chat; we do not need them. The chat may be turned off temporarily; the chat then shows the address support@aitranslator.io.vn.

## 12. Changes to this policy

When the policy changes we update this text and the effective date, and announce significant changes in the app or on the website. Continuing to use the app after the effective date means you accept the new version.

## 13. Contact

**Do Tien Phong**, support@aitranslator.io.vn.
