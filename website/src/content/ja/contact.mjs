import { pageHero, sectionHead, callout, facts, linkCard, icon } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "お問い合わせとサポート", path: "/ja/contact/" },
];

const EMAIL = SITE.email;
// 件名と本文のひな形を入れた mailto リンク。HTML の属性内なので `&amp;` を使います。サポートは英語またはベトナム語で
// 返信するため、項目名には英語を併記します。
const mail = (subject, body) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&amp;body=${encodeURIComponent(body.join("\n"))}` : ""}`;

const M = {
  support: mail("AI Translator technical support", [
    "AI Translator のバージョン（このアプリについて）(App version):",
    "OS とパソコン（例：macOS 15、MacBook Air M2 または Windows 11、Intel Core i5-1235U）(OS and computer):",
    "RAM:",
    "グラフィックスカード（Windows の場合）(Graphics card):",
    "モデルパック（Standard または Lite）(Model pack):",
    "使っている会議アプリ (Meeting app):",
    "起きたこと (What happened):",
    "再現の手順 (Steps to reproduce):",
  ]),
  key: mail("Lost AI Translator license key", ["購入に使ったメールアドレス (Email used to buy):", "「設定 › ライセンス › キーをなくしましたか？」を試しましたか（はい／いいえ）(Tried Lost your key?):"]),
  payment: mail("AI Translator payment problem", ["注文番号（アップグレード画面の「注文 …」の行）(Order code):", "購入に使ったメールアドレス (Email used to buy):", "支払い方法（VietQR または国際カード）、日時、金額 (Payment method, time, amount):", "問題 (Problem):"]),
  refund: mail("AI Translator refund request", ["注文番号 (Order code):", "支払い日 (Payment date):", "理由 (Reason):"]),
  erase: mail("Request to delete or anonymize personal data", ["このメールアドレスに関連する個人データの削除または匿名化を依頼します。(I ask you to delete or anonymize the personal data linked to this email.)", "（購入に使ったのと同じメールアドレスから送信しています。）(Sent from the same email I used to buy.)"]),
  security: mail("[Security] AI Translator security report", ["見つけたこと (What I found):", "再現の手順 (Steps to reproduce):", "影響を受けるバージョンまたはコンポーネント (Affected version or component):"]),
  feedback: mail("AI Translator feedback", ["必要なこと、またはうまく動かないこと (What you need, or what is not working well):"]),
};

const btn = (href, label) => `<p><a class="btn btn-secondary btn-sm" href="${href}">${icon("mail")} ${label}</a></p>`;

export default {
  id: "contact",
  lang: "ja",
  path: "/ja/contact/",
  title: "お問い合わせとサポート",
  description:
    "AI Translator へのお問い合わせは support@aitranslator.io.vn まで。インストーラー、技術サポート、キーの紛失、支払い、返金、データ削除、セキュリティ報告。",
  schemaType: "ContactPage",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "お問い合わせとサポート",
  lead: "AI Translator へのご連絡は support@aitranslator.io.vn へのメールでお願いします。これが唯一のサポート窓口で、このウェブサイトにはお問い合わせフォームもサポート用の電話もありません。",
})}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["メール", `<a href="mailto:${EMAIL}">${EMAIL}</a><small>サポートは英語またはベトナム語で返信します。メールも英語かベトナム語でお書きいただくと確実です</small>`],
  ["ほかの窓口", "なし<small>ウェブフォームも電話もありません</small>"],
  ["返信", "返信までの時間はお約束していません<small>一人で運営している製品のため、具体的な返信時間はお約束できません</small>"],
  ["セキュリティの報告", `<a href="/.well-known/security.txt">/.well-known/security.txt</a><small>または件名を [Security] で始めてメールをお送りください</small>`],
])}</div>
<p class="center-text reveal"><a class="btn btn-primary btn-lg" href="mailto:${EMAIL}">${icon("mail")} メールを送る</a></p>
<p class="disclaimer">以下のどのご依頼でも、パスワード、カード番号、銀行口座番号を送っていただく必要はありません。私たちはそれらを必要とせず、受け取ることもありません。</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "送っていただきたい内容", title: "ご用件は何ですか？この情報を添えてメールをお送りください", text: "下の各ボタンを押すと、件名とひな形が入った状態でメールアプリが開きます。開かない場合は、上のアドレスに直接お書きください。", center: true })}
<div class="grid grid-2">

<div class="card reveal" id="installer">
<h3>インストーラーをメールで受け取る</h3>
<p>macOS も Windows も、ダウンロードページのコマンド 1 行でインストールでき、メールは不要です。macOS の .dmg や Windows の .exe をメールで受け取りたい場合は、ダウンロードページのひな形（macOS 用と Windows 用があります）を使ってメールをお送りください：パソコンのモデルとチップまたはプロセッサー、macOS か Windows のバージョン、RAM、使っている会議アプリ、必要な言語。確認できるよう、インストーラーを SHA-256 チェックサムとともにお送りします。</p>
<p><a class="btn btn-secondary btn-sm" href="/ja/download/">ダウンロードページを開く ${icon("arrow-right")}</a></p>
</div>

<div class="card reveal" id="technical-support">
<h3>技術サポート</h3>
<p>次の情報を添えてください：アプリのバージョン（このアプリについて）、macOS のバージョンとチップ（Apple メニュー › この Mac について）または Windows のバージョンとプロセッサー（設定 › システム › バージョン情報）とグラフィックスカード、RAM、使っているモデルパック（設定 › モデル：Standard または Lite）、会議アプリ、問題が起きるまでの手順、エラーメッセージの文面。</p>
<p>いちばん早い方法：「このアプリについて › ログをサポートに送信」を選び、表示されるレポートコード（R-XXXX-XXXX のような形式）をメールに書いてください。そのコードでログを見つけられます。ログに話した内容が含まれることはなく、個人情報は送信前に取り除かれます。ファイルをご自身で添付したい場合は、「このアプリについて › ログフォルダーを開く」を選んでください。よくある問題の多くはすぐに直せるので、まず<a href="/ja/guide/troubleshooting/">トラブルシューティングの手順</a>をお試しください。</p>
${btn(M.support, "技術サポートにメールする")}
</div>

<div class="card reveal" id="lost-key">
<h3>ライセンスキーの紛失</h3>
<p>ご自身で取り戻せます：「設定 › ライセンス › キーをなくしましたか？」で購入に使ったメールアドレスを入力し、「キーを送信」を選んでください。メールは no-reply@mail.aitranslator.io.vn から届くので、迷惑メールのフォルダーも確認してください。それでも届かない場合は、購入に使ったアドレスからメールをお送りください。<a href="/ja/guide/buy-and-activate/">キーの購入と有効化のガイド</a>もご覧ください。</p>
${btn(M.key, "キーの紛失についてメールする")}
</div>

<div class="card reveal" id="payment">
<h3>お支払いの問題</h3>
<p>支払ったのにキーが届かない、金額が足りなかった、注文が失敗したといった場合は、注文番号（アップグレード画面の「注文 …」の行）、購入に使ったメールアドレス、支払い方法、日時と金額をお送りください。カードでのお支払いの場合は、入力したアドレスに Creem から届いた領収書があれば添付してください。VietQR の振込は、お使いの銀行と PayOS が扱います。カードでのお支払いでは Creem が販売者（merchant of record、再販業者）として決済と税金を扱い、私たちが銀行口座やカードの情報を受け取ることはありません。</p>
${btn(M.payment, "お支払いについてメールする")}
</div>

<div class="card reveal" id="refund">
<h3>返金の依頼</h3>
<p>まず支払い日から <strong>7 日以内</strong>に、注文番号と理由を添えて私たちにご依頼ください。お支払いは返金できません。ただし、こちら側の不具合で購入したプランを使えず、妥当な期間内に修正できない場合や、法律で別の定めがある場合は除きます。プランの変更は返金の対象外です。カードでのお支払いは Creem が販売者（merchant of record）なので、Creem が Creem の規約に基づいて返金することもあります。7 日を過ぎても私たちから返信がない場合は、Creem にご連絡いただけます（creem.io/my-orders/login で注文を確認できます）。注文が返金された場合（全額でも一部でも、カードのチャージバックによる場合も含む）、その注文でライセンスに追加された期間を短縮するか、ライセンスがその注文だけで構成されている場合はライセンスを取り消すことがあります。これは自動ではなく、運営者が個別に判断します。詳しくは<a href="/en/terms/">利用規約（英語）</a>をご覧ください。</p>
${btn(M.refund, "返金を依頼する")}
</div>

<div class="card reveal" id="delete-data">
<h3>個人データの削除または匿名化</h3>
<p>ご本人であることを確認するため、<strong>購入に使ったのと同じメールアドレスから</strong>ご依頼ください。メールアドレスとデバイス名を削除します。最小限のデータ（ハッシュ化したマシン ID、同意した日時、会計上必要な注文の行）は残り、ライセンスは引き続き使えますが、メールで取り戻すことはできなくなります。Creem のページで入力したデータは Creem のポリシーに基づいて Creem が保管するため、そちらで削除するには Creem にご連絡ください。全一覧は<a href="/ja/data-security/#delete-data">データとセキュリティ</a>にあります。ご自身のパソコンにあるデータは、アプリの中ですぐに削除できます。</p>
${btn(M.erase, "データの削除を依頼する")}
</div>

<div class="card reveal" id="security">
<h3>セキュリティの問題を報告する</h3>
<p>アプリ、ライセンスサーバー、このウェブサイトに脆弱性を見つけたと思われる場合は、件名を [Security] で始めてメールをお送りください。説明、再現の手順、影響を受けるバージョンを添えてください。私たちとやり取りをするまでは、公開しないようお願いします。セキュリティの連絡先は <a href="/.well-known/security.txt">security.txt</a> ファイルにも記載しています。</p>
${btn(M.security, "セキュリティの報告を送る")}
</div>

<div class="card reveal" id="feedback">
<h3>ご意見と新しいご要望</h3>
<p>ほかの言語が必要、複数のパソコンで使いたい、別のアイデアがある、といった場合はお知らせください。<a href="/ja/about/#under-consideration">次の段階</a>で何を検討するかの順番は、利用者のご意見で決まります（お約束ではありません）。AI Translator を何に使っているか教えてください。</p>
${btn(M.feedback, "ご意見を送る")}
</div>

</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "お書きになる前に", title: "すぐに答えが見つかるかもしれません" })}
${callout({ title: "連絡先について。", text: "AI Translator の提供者は Đỗ Tiến Phong（個人）です。このウェブサイトでは住所、電話番号、税番号を公開していません。ご連絡はすべて上のメールアドレスでお受けしています。" })}
<div class="grid grid-3">
${linkCard({ href: "/ja/faq/", icon: "message", title: "よくある質問", text: "インストール、プライバシー、プラン、お支払いについての短い回答。", more: "よくある質問を読む" })}
${linkCard({ href: "/ja/guide/troubleshooting/", icon: "support", title: "トラブルシューティング", text: "よくある問題と、その手順ごとの直し方。", more: "ガイドを見る" })}
${linkCard({ href: "/ja/data-security/", icon: "shield", title: "データとセキュリティ", text: "パソコンに残るもの、サーバーに保存するもの、その保存期間。", more: "詳しく読む" })}
</div>
</div></section>
`,
};
