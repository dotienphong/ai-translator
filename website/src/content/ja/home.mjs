import { dataFlow, demo, demoVideo, feature, featureTabs, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_ITEMS = [
  { kind: "meeting", text: `英語で話す同僚の発言に日本語の字幕が表示されます。${videoMeta("ja", "meeting").seconds} 秒、音声付きの動画です。`, label: "AI Translator デモ動画：会議のリアルタイム翻訳", fallback: "動画をダウンロード（MP4、1 MB）" },
  { kind: "typing", text: `入力翻訳が日本語の返信を英語に変えてチャット欄に貼り付けます。${videoMeta("ja", "typing").seconds} 秒、音声付きの動画です。`, label: "AI Translator デモ動画：入力翻訳", fallback: "動画をダウンロード（MP4、1 MB）" },
];
const [MEETING_VIDEO, TYPING_VIDEO] = VIDEO_ITEMS;

export const HOME_FAQ = [
  {
    q: "Zoom、Teams、Google Meet、Zalo で使えますか？",
    a: `<p>はい。ボットもプラグインも不要です。アプリはパソコンのシステム音声を取り込むため、どの会議アプリを使っていても関係ありません。macOS で Zoom、Google Meet、Microsoft Teams、Zalo PC の音声取り込みを確認しました（社内テストであり、各社による認定ではありません）。ほかの参加者には通知されないため、社内規則などで必要な場合はご自身で伝えてください。</p>`,
  },
  {
    q: "AI Translator の利用にインターネット接続は必要ですか？",
    a: `<p>翻訳中は必要ありません。音声認識、翻訳、字幕の表示はすべてパソコン上で行われます。インターネットが必要なのは、初回にアプリとモデル（約 1.3 GB または 2.5 GB）をダウンロードするとき、無料お試しを登録するとき、プランを購入するとき、ライセンスを確認するとき（有料プランは確認と確認のあいだ最大 14 日間オフラインで使えます）、そしてアプリを更新するときだけです。</p>`,
  },
  {
    q: "会議の音声はどこかに送信されますか？",
    a: `<p>いいえ。翻訳中、音声はメモリ（RAM）上にだけ存在し、ディスクに書き込まれることもネットワークに送られることもありません。macOS でネットワークプロキシを使って確認したところ、翻訳中にアプリが外部に送った音声や文字起こしのテキストはありませんでした。</p>`,
  },
  {
    q: "ライブ配信を自分の言語に翻訳できますか？",
    a: `<p>パソコンでならできます。アプリはパソコンで再生されている音声を聞き取るので、ウェブサイトに左右されません。YouTube Live（英語のニュースチャンネル、macOS の Chrome、2026年10月25日）で 1 回試しました。試している間ずっとベトナム語の字幕が表示されました。TikTok ライブについては、BGM が流れるベトナム語のライブ配信 1 件の結果しかありません。アプリは音声を取り込みましたが、言語を誤認識し、誰も言っていない文を繰り返したため、字幕は実用になりませんでした。Facebook Live では試していません。スマホ版はなく、ご自身のライブ配信に視聴者向けの字幕を追加することもできません。<a href="/ja/solutions/livestream-translation/">ライブ配信の翻訳</a>をご覧ください。</p>`,
  },
  {
    q: "会議の翻訳字幕を無料で使えますか？",
    a: `<p>AI Translator には 10 日間の無料お試しがあり、1 日最大 30 分まで翻訳できます。カードもアカウントも不要です。ただしお試しであり、ずっと無料で使えるプランではありません。その後は前払いのプランが必要です：Monthly 50,000 ₫、6 Months 269,000 ₫、Yearly 500,000 ₫。</p>`,
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
  modified: "2026-10-27",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    ...VIDEO_ITEMS.map((v) => videoObject({ lang: "ja", kind: v.kind, name: v.label, description: v.text, uploadDate: "2026-10-26" })),
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

<section class="section" id="main-features"><div class="container">
${sectionHead({ eyebrow: "主な機能", title: "会議の翻訳、入力翻訳、履歴", center: true })}
${featureTabs({
  listLabel: "機能を選ぶ",
  tabs: [
    {
      id: "meeting-translation",
      icon: "captions",
      label: "会議の翻訳",
      title: "外国語の会議を、自分の言語の字幕で読む",
      lead: "パソコンで再生されている音声を聞き取り、翻訳をフローティング字幕バーに表示します。会議にボットは参加しません。",
      bullets: [
        "5 つの言語のうち、どの 2 つのあいだでも翻訳：英語、中国語、日本語、韓国語、ベトナム語。話されている言語は自動で検出します",
        `話し手が文を言い終えると字幕が表示されます。Mac M4 Pro（Standard モデルパック）での中央値は 1.1 秒未満で、ほかのパソコンでは遅くなることがあります（<a href="/ja/features/#performance">測定条件</a>）`,
        `Zoom、Teams、Meet、Zalo で使えます。対面の会議は入力元を<strong>マイク</strong>にします（<a href="/ja/features/#microphone">使い方</a>）。パソコンで見るライブ配信にも使えます（<a href="/ja/solutions/livestream-translation/">ライブ配信の翻訳</a>）`,
      ],
      cta: { href: "/ja/features/", label: "すべての機能を見る" },
      media: demoVideo({ lang: "ja", kind: MEETING_VIDEO.kind, label: MEETING_VIDEO.label, fallback: MEETING_VIDEO.fallback }),
    },
    {
      id: "type-and-translate",
      icon: "keyboard",
      label: "入力翻訳",
      title: "相手の言語で返信する",
      lead: "使っているチャット欄で ⌃⌥G（Windows では Ctrl+Alt+G）を押し、自分の言語で入力して Enter を押すと、翻訳がチャット欄に貼り付けられます。確認してから送信してください。",
      bullets: [
        "貼り付け（⌘V、Ctrl+V）ができるアプリなら、入力中の欄に貼り付けます",
        "翻訳はパソコン上で行われ、入力した内容が外に出ることはありません",
        "すべてのプランで使え、翻訳時間を消費しません",
      ],
      cta: { href: "/ja/guide/type-and-translate/", label: "入力翻訳のガイドを読む" },
      media: demoVideo({ lang: "ja", kind: TYPING_VIDEO.kind, label: TYPING_VIDEO.label, fallback: TYPING_VIDEO.fallback }),
    },
    {
      id: "history",
      icon: "history",
      label: "履歴",
      title: "会議が終わったあとで振り返る",
      lead: "セッションごとに、各文の時刻、原文、翻訳をまとめた文字起こしが残ります。",
      bullets: [
        "すべてのプラン：最新のセッションの文字起こしを表示、検索、コピー",
        "Pro 機能：セッションの履歴を保存し、過去のセッションを開き直して、TXT、SRT、Markdown で書き出し",
        "履歴の保存は初期設定でオフ。オンにすると暗号化され、あなたのパソコンにだけ保存されます",
      ],
      cta: { href: "/ja/guide/history-and-export/", label: "履歴のガイドを読む" },
      media: appShot({ slug: "app-history", lang: "ja", alt: "履歴画面：保存したセッションの一覧。日時、分数、文の数、プレビュー、開くボタンと削除ボタンがあります", caption: "履歴：パソコンに保存されたセッション。" }),
    },
  ],
})}
</div></section>

<section class="section section-alt" id="how-to-use"><div class="container">
${sectionHead({ eyebrow: "使い方", title: "4 つのステップで使い始める", text: "インストールと設定は一度だけ。そのあとは会議ごとに「開始」を押すだけです。", center: true })}
<div class="split wide-left">
${steps([
  { title: "コマンド 1 行でインストール", text: `<a href="/ja/download/">ダウンロードページ</a>のコマンドを、ターミナル（macOS）または PowerShell（Windows）に貼り付けます。` },
  { title: "最初の設定", text: "言語を選び、モデルをダウンロードして（約 1.3 GB または 2.5 GB）、システムオーディオの録音を許可します（macOS のみ）。" },
  { title: "会議で「開始」を押す", text: "<strong>翻訳先の言語</strong>で言語を選び、<strong>開始</strong>を押します（⌃⌥T、Windows では Ctrl+Alt+T）。" },
  { title: "返信して、振り返る", text: "⌃⌥G（Windows では Ctrl+Alt+G）で入力翻訳を使います。会議が終わったら<strong>文字起こし</strong>または<strong>履歴</strong>を開きます。" },
], true)}
${appShot({ slug: "app-home-running", lang: "ja", alt: "セッション中の AI Translator のメイン画面：翻訳中の状態、言語、音声ソース、翻訳の残り時間", caption: "セッション中のメイン画面（Monthly プラン）。" })}
</div>
<p class="disclaimer">macOS 版はアドホック署名で、公証（notarize）を受けていません。Windows 版はまだコード署名されていません。コマンドでインストールすれば、macOS ではアプリが直接開き、SmartScreen の確認も出ません。ブラウザーでダウンロードしたファイルは初回起動時にブロックや警告が出ることがあります。<a href="/ja/guide/install-macos/">macOS</a> と <a href="/ja/guide/install-windows/">Windows</a> のインストールガイドをご覧ください。</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/ja/guide/quick-start/">クイックスタートガイドを読む ${icon("arrow-right")}</a></p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "データはあなたのパソコンに残ります", title: "AI はあなたのパソコンで動き、会議の内容は外に出ません", center: true })}
${dataFlow("ja")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "音声はパソコンから出ません", text: "音声は RAM 上にだけ存在し、ディスクに書き込まれることもネットワークに送られることもありません。macOS でネットワークプロキシを使って確認しました。接続が途切れても字幕は表示され続けます。", accent: true })}
${feature({ icon: "shield", title: "サーバーに会議の内容はありません", text: "サーバーが保存するのは、プランの販売、デバイスの有効化、サポートに必要なデータだけで（詳細は下記）、会議の内容は保存しません。" })}
</div>
<details class="more-details reveal"><summary>サーバーは正確には何を保存しますか？</summary><p>サーバーに保存するのは、メールアドレス（購入時、またはサポートチャットにご自身で残したとき）、注文、ライセンス、デバイスの有効化情報（ハッシュ化したマシン ID とデバイス名）、Free お試しの開始（ハッシュ化したマシン ID）、ライセンス変更の記録、個人情報を除いたエラーレポート（30 日間保存）、チャットを使った場合のサポートチャットのメッセージ（90 日間保存）だけで、会議の内容は一切保存しません。</p></details>
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
