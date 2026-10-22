import { pageHero, sectionHead, plansGrid, steps, faq, ctaBand, callout, appShot, checkList, icon } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "料金", path: "/ja/pricing/" },
];

export const PRICING_FAQ = [
  {
    q: "Free と有料プランの違いは何ですか？",
    a: `<p>Free はお試しで、そのパソコンが初めて登録した日から 10 日間、1 日最大 30 分まで翻訳でき、1 台につき 1 回だけ使えます。有料プラン（Monthly、6 Months、Yearly）では、Pro 機能（用語集、履歴、書き出し）と、より多くの翻訳時間が使えます。</p>`,
  },
  {
    q: "10 日間のお試しが終わったらどうなりますか？",
    a: `<p>そのパソコンでは Free プランを使えなくなり、翻訳を続けるには Monthly、6 Months、Yearly のいずれかのプランが必要です。アプリのアンインストールと再インストール、データの削除、キーチェーンの消去をしても 10 日間はやり直せません。開始日はパソコンごとにサーバーに記録されているためです。</p>`,
  },
  {
    q: "国際カードで支払えますか？",
    a: `<p>はい。アプリのアップグレード画面には 2 つの支払い方法があります：<strong>VND での VietQR 銀行振込</strong>（ベトナムの銀行から、PayOS ゲートウェイ経由）と、<strong>USD での国際カード</strong>（Monthly US$3.99、6 Months US$21.99、Yearly US$39.99、税抜）です。カードの場合、アプリがブラウザーで Creem の支払いページを開きます。支払いが終わったらアプリに戻ると、プランが自動で有効になります。カードで支払った注文では Creem が販売者（merchant of record、再販業者）として決済とその税金を扱います。Creem の購入者向け規約：<a href="https://www.creem.io/buyer-terms" rel="noopener">https://www.creem.io/buyer-terms</a>。定期支払いはありません。Free のお試しに支払い方法は不要です。</p>`,
  },
  {
    q: "プランは自動で更新されますか？",
    a: `<p>いいえ。どのプランも 1 回きりの前払いの注文で、期限が来ればそのまま終わります。アプリが 7 日前にお知らせするので、更新したいときに更新してください。同じプランを更新すると、30 日（Monthly）、180 日（6 Months）、365 日（Yearly）が追加され、プランがまだ有効な場合は有効期限の日から数えます。</p>`,
  },
  {
    q: "1 つのキーを何台のパソコンで使えますか？",
    a: `<p>1 台です。各キーは 1 台のパソコンでのみ使えます。別のパソコンに移すには、古いパソコンの「設定 › ライセンス」で無効化するか、新しいパソコンで「そのコンピューターを削除して、これを使用」を選んでください。キーがほかのパソコンで使われている間、2 台目は初期設定でブロックされます。あえて「このコンピューターでとにかく有効化」を選んで確認した場合に限り、どちらかがキーを削除するまで、キーは両方で一時的にロックされます。</p>`,
  },
  {
    q: "返金はできますか？",
    a: `<p>お支払いは返金できません。ただし、こちら側の不具合で購入したプランを使えず、妥当な期間内に修正できない場合や、法律で別の定めがある場合は除きます。返金の依頼は、まず支払い日から 7 日以内に、注文番号を添えて support@aitranslator.io.vn までお送りください。プランの変更は返金の対象外です。カードでのお支払いは Creem が販売者（merchant of record）なので、Creem が Creem の規約に基づいて返金することもあります。注文が返金された場合（全額でも一部でも、カードのチャージバックによる場合も含む）、その注文でライセンスに追加された期間を短縮するか、ライセンスがその注文だけで構成されている場合はライセンスを取り消すことがあります。これは自動ではなく、運営者が個別に判断します。詳しくは<a href="/en/terms/">利用規約（英語）</a>をご覧ください。</p>`,
  },
  {
    q: "会社用の電子インボイスはもらえますか？",
    a: `<p>VietQR の注文については、まだ電子インボイスを発行していません。国際カードで支払った注文では、入力したメールアドレスに Creem が領収書を送ります。ほかの書類が必要な場合は support@aitranslator.io.vn にご連絡いただければ、ご相談に応じます。</p>`,
  },
  {
    q: "翻訳時間はどのように数えられますか？",
    a: `<p>数えるのは翻訳された発話だけで、発話の長さで測ります。無音、すでに読みたい言語で話された文、翻訳できなかった部分は数えません。翻訳時間はパソコンごとに別々に管理されます。</p>`,
  },
  {
    q: "キーをなくしました。どうすればいいですか？",
    a: `<p>「設定 › ライセンス › キーをなくしましたか？」を開き、購入に使ったメールアドレスを入力して「キーを送信」を選んでください。そのメールアドレスで有効なキーがすべて、同じアドレスに送られます。support@aitranslator.io.vn に連絡することもできます。</p>`,
  },
];

export default {
  id: "pricing",
  lang: "ja",
  path: "/ja/pricing/",
  title: "料金：無料お試しと 3 つの前払いプラン",
  description:
    "10 日間の無料お試しと、Monthly、6 Months、Yearly の 3 つの前払いプラン。国際カード（US$3.99 から、税抜）または VietQR で支払い、自動更新はありません。",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  schema: [faqPage(PRICING_FAQ.map((f) => ({ q: f.q, a: f.a })))],
  body: () => `
${pageHero({ crumbs, title: "シンプルな料金：前払い、自動更新なし", lead: "10 日間無料でお試しいただき、役に立つと感じたら Monthly、6 Months、Yearly からお選びください。お支払いはアプリの中から始め、ベトナムの銀行からのベトナムドン（VND）での VietQR、または米ドル（USD）での国際カードで支払えます。カードの場合はブラウザーで支払いを完了します。キーはメールで届きます。" })}

<section class="section-tight"><div class="container">
<h2 class="sr-only">4 つのプラン</h2>
${plansGrid("ja", { ctaLabel: "ダウンロード", freeLabel: "インストールして無料で試す" })}
<p class="disclaimer">VND の価格は注文ごとの価格で、VietQR コードの金額と同じです。USD の価格は国際カードで支払う場合の価格で、税抜です。お住まいの国で税（VAT、GST、売上税）がかかる場合は、Creem が支払いページで加算します。価格と翻訳時間はサーバーで設定しています。すでに購入したプランは、その注文が返金されていない限り、購入した期間の翻訳時間をそのまま使えます。</p>
${callout({ title: "ベトナム国外からのお支払い", text: "ベトナムの銀行口座をお持ちでない場合は、アップグレード画面で<strong>カード（USD）</strong>を選んでください。Creem の支払いページでカードで支払えるので、ベトナムの銀行は不要です。Creem の一覧にある一部の国ではカードを利用できません。Free のお試しには、これまでどおり支払い方法は不要です。お困りのときは<a href=\"/ja/contact/\">お問い合わせ</a>ください。" })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "比較", title: "各プランに含まれるもの", center: true })}
<div class="table-wrap reveal" role="region" aria-label="プランの比較" tabindex="0"><table class="compare">
<thead><tr><th scope="col"><span class="sr-only">機能</span></th><th scope="col">Free（お試し）</th><th scope="col">Monthly</th><th scope="col">6 Months</th><th scope="col">Yearly</th></tr></thead>
<tbody>
<tr><th scope="row">価格</th><td>0 ₫</td><td>1 回の注文で 50,000 ₫<small>または US$3.99（税抜）</small></td><td>1 回の注文で 269,000 ₫<small>または US$21.99（税抜）</small></td><td>1 回の注文で 500,000 ₫<small>または US$39.99（税抜）</small></td></tr>
<tr><th scope="row">支払い方法</th><td>支払い不要</td><td>VietQR（VND）または国際カード（USD）</td><td>VietQR（VND）または国際カード（USD）</td><td>VietQR（VND）または国際カード（USD）</td></tr>
<tr><th scope="row">期間</th><td>10 日間、1 台につき 1 回</td><td>1 回の注文で 30 日</td><td>1 回の注文で 180 日</td><td>1 回の注文で 365 日</td></tr>
<tr><th scope="row">翻訳時間</th><td>1 日 30 分</td><td>30 日サイクルごとに 50 時間（3,000 分）</td><td>30 日サイクルごとに 100 時間（6,000 分）</td><td>無制限</td></tr>
<tr><th scope="row">リアルタイム翻訳字幕、5 言語</th><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">カスタマイズできる字幕バー、ショートカット</th><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">文字起こしのコピー</th><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">チャット用の入力翻訳（翻訳時間を消費しません）</th><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">用語集（Pro）</th><td><span class="no">なし</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">セッション履歴（Pro）</th><td><span class="no">なし</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">TXT、SRT、Markdown への書き出し（Pro）</th><td><span class="no">なし</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">1 つのキーで使えるパソコン</th><td>キー不要</td><td>1 台</td><td>1 台</td><td>1 台</td></tr>
<tr><th scope="row">月あたりの目安</th><td>0 ₫</td><td>50,000 ₫</td><td>約 44,800 ₫</td><td>約 41,700 ₫</td></tr>
</tbody></table></div>
<p class="small muted">Monthly を 6 回続けて購入する（180 日）と 300,000 ₫ かかりますが、6 Months なら 1 回の注文で 180 日が 269,000 ₫ です。Monthly を 12 回続けて購入する（360 日）と 600,000 ₫ かかりますが、Yearly なら 1 回の注文で 365 日が 500,000 ₫ です。Monthly は 30 日ごとに 50 時間、6 Months は 30 日ごとに 100 時間まで翻訳でき、Yearly は無制限です。各 Pro 機能の詳細は<a href="/ja/features/">機能ページ</a>をご覧ください。</p>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-upgrade", lang: "ja", alt: "日本語のアプリのアップグレード画面。カード（USD）が選ばれた状態で、ステップ 1 お支払い方法には VietQR 銀行振込（VND）と並んでカード注文では Creem が販売者であるという説明、ステップ 2 プランを選ぶには Free、Monthly、6 Months、Yearly のプランと翻訳時間、税抜の USD 価格（$3.99、$21.99、$39.99）、ステップ 3 お支払いにはキーを受け取るメールアドレス欄とブラウザーで支払うボタン", caption: "カードを選んだアプリのアップグレード画面：2 つの支払い方法、4 つのプラン、USD 価格（税抜）と翻訳時間。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">翻訳時間</span>
<h2>数えるのは翻訳された発話だけ</h2>
${checkList([
  "時間は、翻訳された部分の<strong>発話の長さ</strong>で測ります。前後の余白や無音は数えません",
  "<strong>すでに読みたい言語</strong>で話された文や、スキップされた部分、翻訳できなかった部分は<strong>数えません</strong>",
  "<strong>Free：</strong>30 分の枠は毎日リセットされ、通常はパソコンの時計で 0:00 です（前回のリセットから最低 20 時間後。再開する正確な時刻はアプリに表示されます）",
  "<strong>Monthly と 6 Months：</strong>30 日のサイクルは暦の月ではなく、支払った日から始まります（6 Months は 180 日の中に 6 つのサイクルがあり、それぞれに 100 時間）",
  "残りが 5 分を切るとアプリが知らせます。枠を使い切るとセッションを止め、次に翻訳できる時刻を表示します",
  "翻訳時間はパソコンごとに別々に管理されます",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "購入方法", title: "プランの選択から有効化まで、アプリの中で", center: true })}
${steps([
  { title: "アプリで支払い方法とプランを選ぶ", text: "<strong>Pro にアップグレード</strong>を開き、<strong>お支払い方法</strong>（VND での VietQR か USD での国際カード）を選んでから、Monthly、6 Months、Yearly を選びます（プランの価格は支払い方法に合わせて表示されます）。キーを受け取るメールアドレスを入力し、キーの送付と再送のためにそれを保存することに同意します。" },
  { title: "支払う", text: "<strong>VietQR：</strong>アプリのウィンドウに QR コードが表示され、PayOS の支払いページを開くボタンもあります。コードは 15 分間有効です。<strong>国際カード：</strong>アプリが自動でブラウザーに Creem の支払いページを開きます。30 分以内にお支払いください。支払い済みなら、キーはメールで届きます。もう一度支払わないでください。" },
  { title: "自動で有効になる", text: "決済ゲートウェイが支払いを確認すると（アプリは数秒ごとに確認します）、プランはすぐにパソコンで有効になり、キーがメールで送られます。" },
])}
<p class="center-text reveal"><a class="btn btn-secondary" href="/ja/guide/buy-and-activate/">キーの購入と有効化のガイドを読む ${icon("arrow-right")}</a></p>
<p class="disclaimer">カード番号や銀行口座の情報を私たちが受け取ることはありません。VietQR の場合、メールアドレスを PayOS に送ることはありません。国際カードの場合、支払いページへの事前入力と、Creem から領収書をメールで送るために、アプリで入力したメールアドレスを Creem に送ります。カード注文では Creem が販売者（merchant of record、再販業者）として決済と税金を扱います。</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "更新とプラン変更", title: "柔軟で、日割りで計算", center: true })}
<div class="grid grid-2">
<div class="card reveal"><h3>同じプランを更新する</h3><p>同じプランをもう一度購入すると、30 日（Monthly）、180 日（6 Months）、365 日（Yearly）が追加され、プランがまだ有効な場合は有効期限の日から数えます。アプリは終了の 7 日前と期限切れのあとにお知らせします。自動で課金されることは一切ありません。</p></div>
<div class="card reveal"><h3>有効期間中にプランを変更する</h3><p>新しいプランはすぐに始まり、古いプランの残り日数は<strong>1 日あたりの価格</strong>で換算され、端数は切り捨てられます。たとえば VND の価格で（USD で支払う場合は両方のプランの USD 価格で計算するため、日数が異なることがあります。この例では最大 1 日の差）、Monthly の残りが 20 日のときに Yearly を購入すると 24 日が追加され（Yearly は 389 日間になります）、6 Months を購入すると 22 日が追加されます（6 Months は 202 日間になります）。換算された日数と新しい有効期限（目安）は、支払う前にアプリに表示されます。プランの変更は返金の対象外です。</p></div>
</div>
${callout({ title: "プランの期限が切れたら", text: "10 日間のお試し期間内であれば、パソコンは Free に戻ります。お試し期間が終わっている場合は、翻訳を続けるには有料プランが必要です。有料プランがない間、Pro 機能（履歴、用語集、書き出し）はロックされます。" })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "料金についての質問", title: "購入前に聞いておきたいこと" })}
${faq(PRICING_FAQ)}
</div></section>

${ctaBand({ title: "まずは 10 日間のお試しから", text: "1 日 30 分あれば、実際の会議で試すには十分です。カードもアカウントも不要です。", primary: { href: "/ja/download/", label: "ダウンロード" }, secondary: { href: "/ja/faq/", label: "よくある質問を読む" } })}
`,
};
