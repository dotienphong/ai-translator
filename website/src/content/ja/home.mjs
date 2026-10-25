import { dataFlow, demo, demoVideo, feature, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot, overlayShot, checkList } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_TEXT = `英語で話す同僚の発言に日本語の字幕が表示され、続いて入力翻訳が日本語の返信を英語に変えてチャットで送ります。${videoMeta("ja").seconds} 秒、音声付きの動画です。`;

export const HOME_FAQ = [
  {
    q: "AI Translator の利用にインターネット接続は必要ですか？",
    a: `<p>翻訳中は必要ありません。音声認識、翻訳、字幕の表示はすべてパソコン上で行われます。インターネットが必要なのは、初回にアプリとモデル（約 1.3 GB または 2.5 GB）をダウンロードするとき、無料お試しを登録するとき、プランを購入するとき、ライセンスを確認するとき（有料プランは確認と確認のあいだ最大 14 日間オフラインで使えます）、そしてアプリを更新するときだけです。</p>`,
  },
  {
    q: "ボットを使わずに Zoom 会議を自分の言語に翻訳するには？",
    a: "<p>AI Translator を開き、読みたい言語を選んで「開始」を押します。アプリはパソコンで再生されている Zoom の音声を聞き取り、フローティングバーに翻訳字幕を表示します。ボットは会議に参加せず、主催者が何かを有効にする必要もありません。ほかの参加者には通知されないため、社内規則などで必要な場合はご自身で伝えてください。</p>",
  },
  {
    q: "Zoom、Teams、Google Meet、Zalo で使えますか？",
    a: `<p>はい。アプリはパソコンのシステム音声を取り込むため、どの会議アプリ、ウェビナー、動画を使っていても関係なく、ボットもプラグインも不要です。macOS で Zoom、Google Meet、Microsoft Teams、Zalo PC の音声取り込みを確認しました（社内テストであり、各社による認定ではありません）。macOS では、特定のアプリ 1 つの音声だけを聞き取るように選ぶこともできます。</p>`,
  },
  {
    q: "ライブ配信を自分の言語に翻訳できますか？",
    a: "<p>パソコンでならできます。アプリはパソコンで再生されている音声を聞き取るのでウェブサイトに左右されず、英語、中国語、日本語、韓国語、ベトナム語のライブ配信を、この 5 つのうちほかの言語の字幕にできます。ブラウザーで再生した動画で動作を確認したほか、YouTube Live（英語のニュースチャンネル、macOS の Chrome、2026年10月25日）でも 1 回試しました。試している間ずっとベトナム語の字幕が表示され、翻訳はおおむね発言と合っていました。TikTok ライブについては、BGM が流れるベトナム語のライブ配信 1 件の結果しかありません。アプリは音声を取り込めましたが、BGM の影響で認識を誤ったため、字幕は実用になりませんでした。Facebook Live では試していません。スマホ版はなく、ご自身のライブ配信に視聴者向けの字幕を追加することもできません。<a href=\"/ja/solutions/livestream-translation/\">ライブ配信の翻訳</a>をご覧ください。</p>",
  },
  {
    q: "会議の音声はどこかに送信されますか？",
    a: `<p>いいえ。翻訳中、音声はメモリ（RAM）上にだけ存在し、ディスクに書き込まれることもネットワークに送られることもありません。macOS でネットワークプロキシを使って確認したところ、翻訳中にアプリが外部に送った音声や文字起こしのテキストはありませんでした。</p>`,
  },
  {
    q: "会議の翻訳字幕を無料で使えますか？",
    a: "<p>AI Translator には 10 日間の無料お試しがあり、1 日最大 30 分まで翻訳できます。カードもアカウントも不要です。その後は前払いのプランが必要です：Monthly 50,000 ₫（30 日ごとに 50 時間）、6 Months 269,000 ₫（180 日間、30 日ごとに 100 時間）、Yearly 500,000 ₫（365 日間無制限）。Free はお試しであり、ずっと無料で使えるプランではありません。</p>",
  },
  {
    q: "ベトナム国外から支払えますか？",
    a: `<p>はい。ベトナムの銀行からの VND での VietQR 銀行振込に加えて、アプリのアップグレード画面から、Creem の支払いページで国際カードを使って米ドルで支払えます：Monthly US$3.99、6 Months US$21.99、Yearly US$39.99（税抜）。Creem の一覧にある一部の国ではカードを利用できません。Free のお試しに支払い方法は不要です。</p>`,
  },
];

export default {
  id: "home",
  lang: "ja",
  path: "/ja/",
  title: "ライブ配信と会議のリアルタイム翻訳字幕 | AI Translator",
  description:
    "ライブ配信、動画、Zoom・Teams・Meet の会議にリアルタイム翻訳字幕。英語・中国語・日本語・韓国語・ベトナム語に対応。AI はパソコン上で動き、クラウドは使いません。",
  software: true,
  modified: "2026-10-25",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    videoObject({ lang: "ja", name: "AI Translator デモ動画：会議の翻訳字幕と入力翻訳", description: VIDEO_TEXT, uploadDate: "2026-10-22" }),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS（Apple シリコン）· Windows 10/11 · 10 日間の無料お試し</p>
<h1 class="reveal">すべての会議に <em>AI 翻訳字幕</em> を。あなたのパソコン上で動きます</h1>
<p class="lead reveal"><strong>AI Translator</strong> は、macOS と Windows 向けの、AI によるリアルタイム翻訳デスクトップアプリです。パソコンで再生されている音声をリアルタイムで画面に浮かぶ翻訳字幕に変え、入力したメッセージを相手の言語に翻訳します。AI はあなたのパソコン上で動くため、音声や会議の内容がクラウドに送られることはありません。Zoom、Microsoft Teams、Google Meet、Zalo PC、ウェビナー、動画、パソコンで見るライブ配信で使えます。</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/ja/download/">ダウンロード ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-to-use">使い方を見る</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI は 100% デバイス上で動作</li>
<li>${icon("check")} 会議のデータはクラウドに送られません</li>
<li>${icon("check")} ボットもアカウントも不要</li>
</ul>
</div>
<div class="reveal">
${demo({
  title: "チーム会議（イメージ）",
  rec: "翻訳中",
  langs: "EN → JA",
  note: "イメージ：画面下部に翻訳字幕バーが浮かんでいるオンライン会議",
  names: ["Aiko", "Wei", "Maria", "Tom"],
  pairs: [
    { src: "We will send the quotation by next week.", dst: "来週までに見積書をお送りします。" },
    { src: "Will this specification be ready for next month's release?", dst: "この仕様は来月のリリースに間に合いますか。" },
    { src: "Let's review the schedule in the next meeting.", dst: "次の会議でスケジュールを確認しましょう。" },
  ],
  floatA: { icon: "wifi-off", text: "オフラインで動作" },
  floatB: { icon: "lock", text: "音声はデバイスに残ります" },
})}
</div>
</div></section>

<section class="section-tight" id="video-demo"><div class="container">
${sectionHead({ eyebrow: "デモ動画", title: "AI Translator の動きを見る", text: VIDEO_TEXT, center: true })}
${demoVideo({ lang: "ja", label: "AI Translator デモ動画：会議の翻訳字幕と入力翻訳", fallback: "デモ動画をダウンロード（MP4、2 MB）" })}
</div></section>

<section class="section" id="meeting-translation"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">会議の翻訳</span>
<h2>外国語の会議を、自分の言語の字幕で読む</h2>
<p class="lead">パソコンで再生されている音声を聞き取り、翻訳をフローティング字幕バーに表示します。原文はその上に小さく表示されます。会議にボットは参加せず、ほかの参加者が何かをインストールする必要もありません。</p>
${checkList([
  "5 つの言語のうち、どの 2 つのあいだでも翻訳：英語、中国語（中文）、日本語、韓国語（한국어）、ベトナム語（Tiếng Việt）。話されている言語は自動で検出します",
  "話し手が文を言い終えるとすぐに字幕が表示されます。Mac M4 Pro（Standard モデルパック）での中央値は 1.1 秒未満で、ほかのパソコンでは遅くなることがあります（<a href=\"/ja/features/#performance\">測定条件</a>）",
  "字幕バーは常に最前面に表示されます。ドラッグで移動、文字サイズや色の変更ができ、<strong>ロック</strong>するとクリックがそのまま下に通ります",
  "用語集を使うと、人名や業界の用語の訳し方をヒントとして翻訳に渡せます（Pro 機能）",
  "対面やハイブリッドの会議：入力元を<strong>マイク</strong>または<strong>コンピューターの音声 + マイク</strong>にすると、会議室の人の声も翻訳します（<a href=\"/ja/features/#microphone\">使い方</a>）",
  "ライブ配信や動画にも：アプリはパソコンで再生されている音声なら何でも聞き取るので、ブラウザーのライブ映像でも使えます（<a href=\"/ja/solutions/livestream-translation/\">ライブ配信の翻訳</a>）",
])}
<p><a class="btn btn-secondary" href="/ja/features/">すべての機能を見る ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "ja", alt: "原文を上に小さく、その下に日本語訳を表示している AI Translator の字幕バー", caption: "実際の字幕バー：上に小さく原文、下に翻訳。" })}
</div>
</div>
</div></section>

<section class="section section-alt" id="type-and-translate"><div class="container">
<div class="split wide-right reverse">
<div class="stack-lg reveal">
<span class="eyebrow">入力翻訳</span>
<h2>相手の言語で返信する</h2>
<p class="lead">使っているチャット欄で ⌃⌥G（Windows では Ctrl+Alt+G）を押し、自分の言語で入力して Enter を押すと、翻訳がチャット欄に貼り付けられます。確認してから送信してください。</p>
${checkList([
  "貼り付け（⌘V、Ctrl+V）ができるアプリなら、入力中の欄に貼り付けます",
  "翻訳はパソコン上で行われ、入力した内容が外に出ることはありません",
  "すべてのプランで使え、翻訳時間を消費しません",
])}
<p><a class="btn btn-secondary" href="/ja/guide/type-and-translate/">入力翻訳のガイドを読む ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "ja", alt: "日本語のメッセージと、その下に英語訳が表示された入力翻訳ボックス", caption: "入力翻訳ボックス：Enter を押すと翻訳がチャット欄に貼り付けられます。" })}
</div>
</div>
</div></section>

<section class="section" id="history"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">履歴</span>
<h2>会議が終わったあとで振り返る</h2>
<p class="lead">セッションごとに、各文の時刻、原文、翻訳をまとめた文字起こしが残ります。履歴の保存をオンにすると、過去の会議を開き直して文を探したり、コピーしたり、ファイルに書き出したりできます。</p>
${checkList([
  "すべてのプラン：最新のセッションの文字起こしを表示、検索、コピー",
  "Pro 機能：セッションの履歴を保存し、過去のセッションを開き直して、TXT、SRT、Markdown で書き出し",
  "履歴の保存は初期設定でオフ。オンにすると暗号化され、あなたのパソコンにだけ保存されます",
])}
<p><a class="btn btn-secondary" href="/ja/guide/history-and-export/">履歴のガイドを読む ${icon("arrow-right")}</a></p>
</div>
<div>
${appShot({ slug: "app-history", lang: "ja", alt: "履歴画面：保存したセッションの一覧。日時、分数、文の数、プレビュー、開くボタンと削除ボタンがあります", caption: "履歴：パソコンに保存されたセッション。" })}
</div>
</div>
</div></section>

<section class="section section-alt" id="how-to-use"><div class="container">
${sectionHead({ eyebrow: "使い方", title: "4 つのステップで使い始める", text: "インストールと設定は一度だけ。そのあとは会議ごとに「開始」を押すだけです。", center: true })}
<div class="split wide-left">
${steps([
  { title: "コマンド 1 行でインストール", text: "<a href=\"/ja/download/\">ダウンロードページ</a>のインストールコマンドを、ターミナル（macOS）または PowerShell（Windows）に貼り付けます。アプリが自動でダウンロードされ、検証されてから開きます。" },
  { title: "最初の設定", text: "言語を選び、利用規約に同意し、モデルをダウンロードして（約 1.3 GB または 2.5 GB）、システムオーディオの録音を許可し（macOS のみ）、例文を再生して試します。" },
  { title: "会議で「開始」を押す", text: "読みたい言語を<strong>翻訳先の言語</strong>で選び、<strong>開始</strong>を押します（ショートカット ⌃⌥T、Windows では Ctrl+Alt+T）。字幕はフローティングバーに表示されるので、読みやすい場所にドラッグしてください。" },
  { title: "返信して、振り返る", text: "⌃⌥G（Windows では Ctrl+Alt+G）を押すと、入力翻訳でメッセージを翻訳できます。会議が終わったら<strong>停止</strong>を押し、サイドバーの<strong>文字起こし</strong>または<strong>履歴</strong>を開きます。" },
], true)}
${appShot({ slug: "app-home-running", lang: "ja", alt: "セッション中の AI Translator のメイン画面：翻訳中の状態、言語、音声ソース、翻訳の残り時間", caption: "セッション中のメイン画面（Monthly プラン）。" })}
</div>
<p class="disclaimer">macOS 版はアドホック署名で、公証（notarize）を受けていません。Windows 版はまだコード署名されていません。コマンドでインストールすれば、macOS ではアプリが直接開き、SmartScreen の確認も出ません。ブラウザーでダウンロードしたファイルは初回起動時にブロックや警告が出ることがあり、ブロックモードのスマート アプリ コントロールは Windows 版をブロックします。<a href="/ja/guide/install-macos/">macOS</a> と <a href="/ja/guide/install-windows/">Windows</a> のインストールガイドをご覧ください。</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/ja/guide/quick-start/">クイックスタートガイドを読む ${icon("arrow-right")}</a> <a class="btn btn-ghost" href="/ja/guide/">すべてのガイド</a></p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "データはあなたのパソコンに残ります", title: "AI はあなたのパソコンで動き、会議の内容は外に出ません", text: "音声認識、翻訳、字幕の表示はすべてあなたのパソコン上で行われ、クラウドの AI サービスは使いません。", center: true })}
${dataFlow("ja")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "音声はパソコンから出ません", text: "音声は RAM 上にだけ存在し、ディスクに書き込まれることもネットワークに送られることもありません。macOS でネットワークプロキシを使って確認しました。翻訳にサーバーは要らないため、接続が不安定になったり途切れたりしても字幕は表示され続けます。", accent: true })}
${feature({ icon: "shield", title: "サーバーに会議の内容はありません", text: "サーバーに保存するのは、メールアドレス（購入時、またはサポートチャットにご自身で残したとき）、注文、ライセンス、デバイスの有効化情報（ハッシュ化したマシン ID とデバイス名）、Free お試しの開始（ハッシュ化したマシン ID）、ライセンス変更の記録、個人情報を除いたエラーレポート（30 日間保存）、チャットを使った場合のサポートチャットのメッセージ（90 日間保存）だけで、会議の内容は一切保存しません。" })}
</div>
<p class="center-text reveal"><a class="btn btn-secondary" href="/ja/data-security/">データの行き先を詳しく見る ${icon("arrow-right")}</a></p>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "料金", title: "シンプルな 4 つのプラン。VietQR または国際カードで前払い", text: "自動更新も定期請求もなく、自動で課金されることは一切ありません。", center: true })}
${plansGrid("ja", { ctaLabel: "ダウンロード", freeLabel: "インストールして無料で試す" })}
<p class="disclaimer">VND の価格はベトナムの銀行からの VietQR でのお支払い、USD の価格は国際カードでのお支払いで、税抜です（税がかかる場合）。</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/ja/pricing/">プランを詳しく比較する ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "よくある質問", title: "最初に知っておきたいこと" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/ja/faq/">すべての質問を見る ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "すべての会議を理解する準備はできましたか？", text: "コマンド 1 行でインストールし（Mac はターミナル、Windows は PowerShell）、10 日間無料でお試しください。カードは不要です。", primary: { href: "/ja/download/", label: "ダウンロード" }, secondary: { href: "/ja/guide/quick-start/", label: "クイックスタートガイドを読む" } })}
`,
};
