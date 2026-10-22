import { RELEASE } from "../../site.mjs";
import { dataFlow, demo, demoVideo, feature, steps, plansGrid, faq, ctaBand, sectionHead, icon, facts, linkCard, appShot, overlayShot, callout, checkList } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_TEXT = `英語で話す同僚の発言に日本語の字幕が表示され、続いて入力翻訳が日本語の返信を英語に変えてチャットで送ります。${videoMeta("ja").seconds} 秒、音声付きの動画です。`;

export const HOME_FAQ = [
  {
    q: "AI Translator の利用にインターネット接続は必要ですか？",
    a: `<p>翻訳中は必要ありません。音声認識、翻訳、字幕の表示はすべてパソコン上で行われます。インターネットが必要なのは、初回にアプリとモデル（約 1.3 GB または 2.5 GB）をダウンロードするとき、無料お試しを登録するとき、プランを購入するとき、ライセンスを確認するとき（有料プランは確認と確認のあいだ最大 14 日間オフラインで使えます）、そしてアプリを更新するときだけです。</p>`,
  },
  {
    q: "パソコン上で会議の字幕を翻訳するオフラインアプリはありますか？",
    a: "<p>はい。AI Translator（aitranslator.io.vn）は macOS 14.2 以降（Apple シリコン）と Windows 10/11 64 ビット（x64）向けのデスクトップアプリで、パソコンで再生されるあらゆる音声にリアルタイムの翻訳字幕を表示します。音声認識と翻訳はデバイス上で動くため、翻訳中にインターネットは不要で、音声がパソコンの外に出ることはありません。英語、中国語、日本語、韓国語、ベトナム語に対応し、10 日間の無料お試しがあります。</p>",
  },
  {
    q: "ボットを使わずに Zoom 会議を自分の言語に翻訳するには？",
    a: "<p>AI Translator を開き、読みたい言語を選んで「開始」を押します。アプリはパソコンで再生されている Zoom の音声を聞き取り、フローティングバーに翻訳字幕を表示します。ボットは会議に参加せず、主催者が何かを有効にする必要もありません。ほかの参加者には通知されないため、社内規則などで必要な場合はご自身で伝えてください。</p>",
  },
  {
    q: "会議の翻訳字幕を無料で使えますか？",
    a: "<p>AI Translator には 10 日間の無料お試しがあり、1 日最大 30 分まで翻訳できます。カードもアカウントも不要です。その後は前払いのプランが必要です：Monthly 50,000 ₫（30 日ごとに 50 時間）、6 Months 269,000 ₫（180 日間、30 日ごとに 100 時間）、Yearly 500,000 ₫（365 日間無制限）。Free はお試しであり、ずっと無料で使えるプランではありません。</p>",
  },
  {
    q: "会議の音声はどこかに送信されますか？",
    a: `<p>いいえ。翻訳中、音声はメモリ（RAM）上にだけ存在し、ディスクに書き込まれることもネットワークに送られることもありません。macOS でネットワークプロキシを使って確認したところ、翻訳中にアプリが外部に送った音声や文字起こしのテキストはありませんでした。</p>`,
  },
  {
    q: "Zoom、Teams、Google Meet、Zalo で使えますか？",
    a: `<p>はい。アプリはパソコンのシステム音声を取り込むため、どの会議アプリ、ウェビナー、動画を使っていても関係なく、ボットもプラグインも不要です。macOS で Zoom、Google Meet、Microsoft Teams、Zalo PC の音声取り込みを確認しました（社内テストであり、各社による認定ではありません）。macOS では、特定のアプリ 1 つの音声だけを聞き取るように選ぶこともできます。</p>`,
  },
  {
    q: "AI Translator はどの言語に対応していますか？",
    a: `<p>話される音声と翻訳の両方で 5 言語に対応しています：英語、中国語（中文）、日本語、韓国語（한국어）、ベトナム語（Tiếng Việt）。今後さらに言語を追加する予定です（時期は未定）。アプリの表示言語は、ベトナム語、英語、日本語、中国語（簡体字）、韓国語から選べます。</p>`,
  },
  {
    q: "アカウントの作成は必要ですか？",
    a: `<p>いいえ。サインインはありません。Free のお試しでは利用規約への同意だけが必要で、有料プランは支払い後にメールで届くライセンスキーで有効にします。</p>`,
  },
  {
    q: "ベトナム国外から支払えますか？",
    a: `<p>はい。ベトナムの銀行からの VND での VietQR 銀行振込に加えて、アプリのアップグレード画面から、Creem の支払いページで国際カードを使って米ドルで支払えます：Monthly US$3.99、6 Months US$21.99、Yearly US$39.99（税抜）。Creem の一覧にある一部の国ではカードを利用できません。Free のお試しに支払い方法は不要です。</p>`,
  },
  {
    q: "今すぐどこでダウンロードできますか？",
    a: `<p>macOS では、ターミナルに 1 行のコマンドを貼り付けてインストールします。コマンドは<a href="/ja/download/">ダウンロードページ</a>にあり、アプリは「このまま開く」を押さなくても直接開きます。Windows 版も、同じページにある 1 行のコマンドを PowerShell に貼り付けてインストールできます。</p>`,
  },
];

export default {
  id: "home",
  lang: "ja",
  path: "/ja/",
  title: "会議のリアルタイム翻訳字幕、オフラインで動作 | AI Translator",
  description:
    "Zoom、Teams、Google Meet などで翻訳字幕をリアルタイムに表示。英語・中国語・日本語・韓国語・ベトナム語に対応。AI はパソコン上で動き、クラウドを使いません。",
  software: true,
  modified: "2026-10-22",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    videoObject({ lang: "ja", name: "AI Translator デモ動画：会議の翻訳字幕と入力翻訳", description: VIDEO_TEXT, uploadDate: "2026-10-22" }),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS（Apple シリコン）· Windows 10/11 · 10 日間の無料お試し</p>
<h1 class="reveal">すべての会議に <em>AI 翻訳字幕</em> を。あなたのパソコン上で動きます</h1>
<p class="lead reveal">AI Translator は、あなたのパソコン上で動く AI を使い、パソコンで再生されている音声を画面上の翻訳字幕に変えます。遅延は小さく、音声や会議の内容がクラウドに送られることも、クラウドの AI サービスを通ることもありません。Zoom、Microsoft Teams、Google Meet、Zalo PC、ウェビナー、動画で使えます。ボットもアカウントも不要です。</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/ja/download/">ダウンロード ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-it-works">使い方を見る</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI は 100% デバイス上で動作</li>
<li>${icon("check")} 会議のデータはクラウドに送られません</li>
<li>${icon("check")} 低遅延</li>
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

<section class="section-tight"><div class="container narrow">
<h2 class="sr-only">AI Translator とは？</h2>
<p class="lead reveal"><strong>AI Translator</strong> は、パソコンで再生されている音声にリアルタイムの翻訳字幕を表示するデスクトップアプリです。音声を認識して翻訳し、その結果をフローティング字幕バーに表示します。処理はすべてあなたのパソコン上で行われ、会議にボットが参加することも、アカウントを作ることもありません。macOS 版（Apple シリコン）はコマンド 1 行でインストールでき、Windows 10/11 版も PowerShell のコマンド 1 行でインストールできます。</p>
<div class="reveal">${facts([
  ["製品の種類", "リアルタイム翻訳字幕のデスクトップアプリ"],
  ["現在のバージョン", RELEASE.ja],
  ["対応 OS", "macOS 14.2 以降（Apple シリコン）と Windows 10/11 x64<small>どちらもコマンド 1 行でインストール</small>"],
  ["言語", "英語、中国語（中文）、日本語、韓国語（한국어）、ベトナム語（Tiếng Việt）<small>話される音声と翻訳の両方に対応。今後さらに言語を追加する予定です</small>"],
  ["処理", "100% デバイス上で処理し、音声は外部に送られません<small>音声認識と翻訳はどちらもデバイス上で動作</small>"],
  ["料金", "10 日間の無料お試し · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>VietQR（VND）または国際カード（USD）で前払い、自動更新なし</small>"],
  ["提供者", "Đỗ Tiến Phong<small>サポート：support@aitranslator.io.vn</small>"],
])}</div>
</div></section>

<section class="section-tight"><div class="container">
<ul class="app-strip reveal"><li>Zoom</li><li>Microsoft Teams</li><li>Google Meet</li><li>Zalo PC</li><li>ウェビナー</li><li>オンライン動画</li></ul>
<p class="disclaimer">パソコンで再生されるあらゆる音声で使えます。Zoom、Microsoft Teams、Google Meet、Zalo は各所有者の製品名です。AI Translator はこれらの企業と提携していません。</p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "データはあなたのパソコンに残ります", title: "AI はあなたのパソコンで動き、会議の内容は外に出ません", text: "音声認識、翻訳、字幕の表示はすべてあなたのパソコン上で行われます。AI Translator が会議の音声や内容をクラウドに送ることはなく、処理にクラウドの AI サービスも使いません。", center: true })}
${dataFlow("ja")}
<div class="grid grid-3">
${feature({ icon: "lock", title: "クラウドには何も送りません", text: "音声は RAM 上にだけ存在し、ディスクに書き込まれることもネットワークに送られることもありません。文字起こしと翻訳は画面に表示され、パソコンに残ります。履歴は初期設定でオフで、オンにした場合も暗号化してパソコンに保存されます。", accent: true })}
${feature({ icon: "zap", title: "低遅延", text: "サーバーとの往復がないため、話し手が文を言い終えるとすぐに字幕が表示されます。Mac M4 Pro（Standard モデルパック）での中央値は 1.1 秒未満です。ほかのパソコンでは遅くなります。内蔵グラフィックスの Windows ノートパソコン 1 台での予備テストでは、中央値は 1.3〜5.4 秒でした（機能ページの「パフォーマンス」をご覧ください）。" })}
${feature({ icon: "shield", title: "情報漏えいのリスクを抑える", text: "契約、人事、財務、製品計画など、会議の内容が翻訳のために第三者へ渡ることはありません。サーバーに保存するのは、メールアドレス（購入時）、注文、ライセンス、デバイスの有効化情報（ハッシュ化したマシン ID とデバイス名）、Free お試しの開始（ハッシュ化したマシン ID）、ライセンス変更の記録、個人情報を除いたエラーレポート（30 日間保存）、チャットを使った場合のサポートチャットのメッセージ（90 日間保存）だけで、会議の内容は一切保存しません。" })}
</div>
<p class="center-text reveal"><a class="btn btn-secondary" href="/ja/data-security/">データの行き先を詳しく見る ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt" id="how-it-works"><div class="container">
${sectionHead({ eyebrow: "使い方", title: "インストールから最初の字幕まで 3 ステップ", text: "面倒な設定も、会議に招待するボットもありません。", center: true })}
${steps([
  { title: "アプリをインストールし、モデルを一度だけダウンロード", text: "アプリを開いて最初の案内に従い、システムオーディオの録音を許可し（macOS）、モデルをパソコンにダウンロードします（パックにより約 1.3 GB または 2.5 GB）。そのあとはすべてオフラインで動きます。" },
  { title: "会議が始まったら「開始」を押す", text: "読みたい言語（<strong>翻訳先の言語</strong>）を選び、<strong>開始</strong>を押すかショートカットを使います。Zoom、Teams、Meet、動画など、パソコンで再生されているものを何でも聞き取ります。" },
  { title: "浮かんでいる字幕を読む", text: "話し手が文を言い終えるとすぐに、字幕バーに翻訳が表示されます（Mac M4 Pro での遅延の中央値は 1.1 秒未満。ほかのパソコンでは遅くなることがあります）。その上には原文が小さく表示されます（オフにもできます）。ドラッグで移動、サイズ変更、文字サイズの変更、位置のロックができます。" },
])}
<p class="center-text reveal"><a class="btn btn-ghost" href="/ja/guide/quick-start/">クイックスタートガイドを読む ${icon("arrow-right")}</a></p>
</div></section>

<section class="section"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">字幕バー</span>
<h2>どんな背景でも読みやすいフローティング字幕</h2>
<p class="lead">常に最前面に表示され、会議アプリのフォーカスを奪わないバーです。翻訳は単語ごとに表示され、まだ確定していない文は薄く表示されます。原文は上に小さく表示されます（初期設定でオン、オフにもできます）。</p>
${checkList([
  "ドラッグで移動、端をドラッグでサイズ変更。位置は画面ごとに記憶されます",
  "文字サイズ 14〜48 px、文字色 5 種類、背景色 5 種類、背景の不透明度も調整可能",
  "<strong>ロック</strong>すると、マウスのクリックがそのまま下に通り、会議アプリの操作を邪魔しません",
  "マウスホイールやショートカットで前の文にさかのぼれます",
])}
<p><a class="btn btn-secondary" href="/ja/features/">すべての機能を見る ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "ja", alt: "原文を上に小さく、その下に日本語訳を表示している AI Translator の字幕バー", caption: "実際の字幕バー：上に小さく原文、下に翻訳。" })}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-home-running", lang: "ja", alt: "セッション中の AI Translator のメイン画面：翻訳中の状態、言語、音声ソース、翻訳の残り時間", caption: "セッション中のメイン画面（Monthly プラン）。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">シンプルな操作</span>
<h2>必要なものは 1 つの画面に</h2>
<p class="lead">読みたい言語を選び、音声ソースを選んで「開始」を押すだけです。翻訳の残り時間はメイン画面にそのまま表示されます。</p>
${checkList([
  "話される言語と翻訳の言語は 5 つ：英語、中国語（中文）、日本語、韓国語（한국어）、ベトナム語（Tiếng Việt）",
  "話されている言語を自動で検出。話される言語がわかっているときは 1 つに固定することもできます",
  "会議アプリから離れずに、字幕の開始、表示／非表示、ロック、スクロールができるグローバルショートカット",
  "ウィンドウを閉じても、メニューバーのアイコンでアプリが動き続けます",
])}
</div>
</div>
<div class="split wide-right">
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

<section class="section"><div class="container">
${sectionHead({ eyebrow: "AI Translator を選ぶ理由", title: "クラウドのツールとは仕組みが違う会議翻訳", text: "多くの会議翻訳ツールは、音声をリモートのサーバーで処理します。AI Translator はその逆で、すべてをあなたのパソコン上で行います。", center: true })}
<div class="grid grid-3">
${feature({ icon: "shield", title: "設計からプライバシー重視", text: "音声は RAM 上にだけ存在し、ディスクに書き込まれることもどこかに送られることもありません。アプリにアクセス解析はありません。エラーが起きたときは、個人情報を除いたエラーレポートを送信します（設定でオフにできます）。", accent: true })}
${feature({ icon: "wifi-off", title: "翻訳中はオフライン", text: "音声認識と翻訳はデバイス上で動くため、接続が不安定になったり途切れたりしても字幕は表示され続けます。インターネットが必要なのは、ライセンスの確認など、ときどき行ういくつかの処理だけです。" })}
${feature({ icon: "video", title: "どの会議アプリでも、ボット不要", text: "招待するボットも、インストールするプラグインもありません。パソコンで音が鳴るものなら何でも字幕にできます。" })}
${feature({ icon: "book", title: "用語集", text: "人名、製品名、業界の用語を登録できます。用語はヒントとして翻訳に渡されます（最大 500 件、CSV のインポートとエクスポートに対応。Pro 機能）。" })}
${feature({ icon: "history", title: "履歴と書き出し", text: "文字起こしを暗号化してパソコンに保存し、TXT、SRT、Markdown で書き出せます。履歴は初期設定でオフなので、使うかどうかはあなたが決められます（Pro 機能）。" })}
${feature({ icon: "languages", title: "5 つの言語", text: "英語、中国語（中文）、日本語、韓国語（한국어）、ベトナム語（Tiếng Việt）のうち、どの 2 つのあいだでも翻訳できます。今後さらに言語を追加する予定です。アプリの表示言語は、ベトナム語、英語、日本語、中国語（簡体字）、韓国語から選べます。" })}
</div>
<div class="stats reveal">
<div class="stat"><b>&lt; 1.1 秒</b><span>話し手が文を言い終えてから翻訳全体が表示されるまでの遅延の中央値（Mac M4 Pro、Standard パック）</span></div>
<div class="stat"><b>0</b><span>翻訳中に外部に送られた音声や文字起こしのデータ（macOS でネットワークプロキシを使って確認）</span></div>
<div class="stat"><b>5 時間 23 分</b><span>macOS での社内テストで、エラーなく続いた 1 回の連続セッション</span></div>
</div>
<p class="disclaimer">数値は特定の 1 台（Mac M4 Pro、24 GB、macOS 26）で測定したものです。ほかのパソコンでは遅くなることがあります。<a href="/ja/features/#performance">パフォーマンスの詳細と測定条件</a>をご覧ください。</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "用途", title: "どの言語の会話でも、内容を追える", center: true })}
<div class="grid grid-2">
${linkCard({ href: "/ja/solutions/online-meeting-translation/", icon: "users", title: "オンライン会議", text: "Zoom、Teams、Google Meet、Zalo PC に翻訳字幕を。ほかの参加者に何かをインストールしてもらう必要はありません。", more: "ソリューションを見る" })}
${linkCard({ href: "/ja/solutions/webinar-and-video-translation/", icon: "play", title: "ウェビナーと動画", text: "外国語の講演、講座、動画を、画面上の翻訳字幕で理解できます。", more: "ソリューションを見る" })}
</div>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "料金", title: "シンプルな 4 つのプラン。VietQR または国際カードで前払い", text: "自動更新も定期請求もなく、自動で課金されることは一切ありません。", center: true })}
${plansGrid("ja", { ctaLabel: "ダウンロード", freeLabel: "インストールして無料で試す" })}
<p class="disclaimer">VND の価格はベトナムの銀行からの VietQR でのお支払い、USD の価格は国際カードでのお支払いで、税抜です（税がかかる場合）。</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/ja/pricing/">プランを詳しく比較する ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${callout({ kind: "warn", title: "はっきりお伝えしていること", text: "macOS 版は現在アドホック署名で、公証（notarize）を受けていません。ターミナルのコマンドでインストールすれば直接開きますが、ブラウザーでダウンロードした .dmg は初回起動時に macOS にブロックされるため、システム設定で許可する必要があります（<a href=\"/ja/guide/install-macos/\">手順をまとめたインストールガイド</a>があります）。Windows 版はまだコード署名されていません。PowerShell のコマンドでインストールすれば SmartScreen の確認は出ませんが、ブラウザーでダウンロードした .exe は警告が出ることがあり、ブロックモードのスマート アプリ コントロールではブロックされます（<a href=\"/ja/guide/install-windows/\">Windows のインストールガイド</a>をご覧ください）。また、Windows での遅延は内蔵グラフィックスのノートパソコン 1 台で予備テストをしただけで、Mac M4 Pro より遅くなります。推測しなくて済むよう、最初にお伝えしています。" })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "よくある質問", title: "最初に知っておきたいこと" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/ja/faq/">すべての質問を見る ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "すべての会議を理解する準備はできましたか？", text: "コマンド 1 行でインストールし（Mac はターミナル、Windows は PowerShell）、10 日間無料でお試しください。カードは不要です。", primary: { href: "/ja/download/", label: "ダウンロード" }, secondary: { href: "/ja/guide/quick-start/", label: "クイックスタートガイドを読む" } })}
`,
};
