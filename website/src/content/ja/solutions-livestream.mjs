import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, overlayShot, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ソリューション", path: "/ja/solutions/" },
  { name: "ライブ配信の翻訳", path: "/ja/solutions/livestream-translation/" },
];

const FAQ = [
  {
    q: "ライブ配信を自分の言語に翻訳するには？",
    a: `<p>パソコンに AI Translator をインストールし、ブラウザーでライブ配信を開いて、翻訳先の言語で読みたい言語（英語、ベトナム語、中国語、日本語、韓国語）を選び、「開始」を押します。アプリはパソコンで再生されている音声を聞き取り、フローティングバーに翻訳字幕を表示します。話し手が文を言い終えてから表示されるまでの遅延は中央値 0.76〜1.03 秒で、Mac M4 Pro（Standard パック）で測定しました。翻訳の品質を測定したのはベトナム語を含む組み合わせだけです（<a href="/ja/features/#quality-by-direction">表を見る</a>）。ほかの組み合わせ（たとえば日本語から英語）も動きますが、測定したスコアはありません。</p>`,
  },
  {
    q: "TikTok Live、YouTube、Facebook Live で使えますか？",
    a: `<p>アプリはパソコンのシステム音声を取り込むので、プラットフォームに左右されません。ライブ配信の音がパソコンで鳴っていれば、アプリはそれを聞き取れます。ブラウザーで再生した動画で動作を確認しました。個々のライブ配信プラットフォームでは試していません。<a href="/ja/solutions/tiktok-live-translation/">TikTok ライブの翻訳</a>もご覧ください。</p>`,
  },
  {
    q: "スマホでライブ配信を翻訳できますか？",
    a: `<p>いいえ。AI Translator が動くのは macOS（Apple シリコン）と Windows 10/11 だけなので、ライブ配信をパソコンで見るときにしか使えません。</p>`,
  },
  {
    q: "リアルタイム翻訳にインターネットは必要ですか？",
    a: `<p>翻訳そのものには不要です。音声認識、翻訳、字幕はあなたのパソコン上で動き、音声がどこかに送られることはありません。ただし、ライブ配信を見るにはインターネットが必要です。</p>`,
  },
  {
    q: "自分のライブ配信を視聴者向けに翻訳できますか？",
    a: `<p>いいえ。AI Translator には、あなたのライブ配信に字幕や翻訳した音声を追加する機能はありません。字幕を作るのはアプリを使っている本人が読むためで、その人のパソコンのフローティングバーに表示されます。</p>`,
  },
  {
    q: "ライブ翻訳は無料ですか？",
    a: `<p>Free プランは 10 日間のお試しで、1 日最大 30 分まで翻訳でき、カードもアカウントも不要です。その後は前払いのプランが必要です。<a href="/ja/pricing/">料金</a>をご覧ください。Free はお試しであり、ずっと無料で使えるプランではありません。</p>`,
  },
];

export default {
  id: "solutions-livestream",
  lang: "ja",
  path: "/ja/solutions/livestream-translation/",
  title: "ライブ配信のリアルタイム翻訳字幕",
  description:
    "パソコンで YouTube や TikTok などのライブ配信を見ながら、リアルタイムの翻訳字幕を表示。AI はパソコン上で動き、スマホ版はありません。",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "ライブ映像の翻訳：ライブ配信にリアルタイムの翻訳字幕",
  lead: "AI Translator はパソコン用のライブ映像翻訳ツールで、ライブ配信をリアルタイムで翻訳し、画面に字幕として表示します。マシンで再生されている音声を聞き取るので、拡張機能なしでブラウザーのライブ映像に使え、音声認識も翻訳もあなた自身のパソコンで動きます。動くのは macOS と Windows だけで、スマホでは使えません。また、字幕はアプリを使って見ている本人が読むためのもので、あなた自身のライブ配信をあなたの視聴者向けに翻訳することはありません。",
  meta: "<span>更新日 {{updated}}</span><span>macOS と Windows のパソコンで動作、スマホには非対応</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["対応", "パソコンのブラウザーやアプリで再生されるライブ配信<small>TikTok Live、YouTube、Facebook Live：アプリはパソコンの音を聞き取るのでプラットフォームに左右されません。個々のプラットフォームでは試していません</small>"],
  ["言語", "英語、中国語（中文）、日本語、韓国語（한국어）、ベトナム語（Tiếng Việt）<small>翻訳の品質を測定したのは、ベトナム語を含む組み合わせだけです</small>"],
  ["遅延", "中央値 0.76〜1.03 秒<small>話し手が文を言い終えてから。Mac M4 Pro、Standard パック。性能の低いマシンではもっと遅くなります</small>"],
  ["プラットフォーム", "macOS 14.2 以降（Apple シリコン）と Windows 10/11 x64<small>スマホ版・タブレット版はありません</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "こんな方に", title: "ライブ配信はすばらしいのに、自分の言語ではないとき", center: true })}
<div class="grid grid-3">
${feature({ icon: "play", title: "ほかの言語のライブ配信を見る人", text: "英語、中国語、日本語、韓国語で話すクリエイター、講演者、放送局のライブ配信を、配信中にそのまま理解したい方。" })}
${feature({ icon: "users", title: "ライブイベントを視聴する人", text: "外国語のカンファレンス、製品発表会、ライブコマースの配信を、発言はせずに視聴するだけの方。" })}
${feature({ icon: "book", title: "学習者", text: "外国語のライブ講義、授業、講演を、1 文ずつ追いかけたい方。" })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">しくみ</span>
<h2>あなたのパソコンで、ライブ配信をリアルタイム翻訳</h2>
${checkList([
  "パソコンのブラウザー（またはアプリ）でライブ配信を開き、AI Translator で<strong>開始</strong>を押します",
  "アプリはパソコンで再生されている音を取り込み、文ごとに区切ってから、あなたのマシン上で音声を認識して翻訳します",
  "翻訳はライブ配信のウィンドウの上に浮かぶ字幕バーに表示され、その上に原文が小さく表示されます",
  "ブラウザーの拡張機能は不要で、アプリがプラットフォームのアカウントに接続することもありません。バーは使っているウィンドウからフォーカスを奪わないので、チャットに入力し続けられます",
])}
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "ja", alt: "3 つの文を表示した AI Translator の字幕バー：すでに日本語の文が 1 行、中国語の文と英語の文は、それぞれ小さな原文の下に大きな文字の日本語訳", caption: "実際の字幕バー：上に小さく原文、下に翻訳。" })}
</div>
</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "使い方", title: "翻訳字幕付きでライブ配信を見る 4 つのステップ" })}
${steps([
  { title: "パソコンでライブ配信を開く", text: "パソコンのブラウザー（またはアプリ）でライブ配信を開き、音を出します。macOS では、初めて「開始」を押したときにシステムから<em>システムオーディオの録音</em>の許可を求められます。<a href=\"/ja/guide/macos-audio-permission/\">許可の与え方</a>をご覧ください。" },
  { title: "言語を選ぶ", text: "<em>翻訳先の言語</em>で読みたい言語を選びます。ライブ配信全体が 1 つの言語なら、<em>音声の言語</em>を<em>自動検出</em>ではなくその言語にします。話し手が言語を切り替える場合は自動検出のままにします。" },
  { title: "「開始」を押す", text: "ライブ配信を再生する前か、始まると同時に<strong>開始</strong>を押します（ショートカット ⌃⌥T、Windows：Ctrl+Alt+T）。アプリは最初の数秒でモデルを読み込みます（インストールや更新の直後の初回は長めで、数分かかることもあります）。" },
  { title: "字幕バーを配置する", text: "バーを映像のすぐ下にドラッグし、「設定 › 字幕」で文字の大きさと色を設定してから、<em>ロック（クリックを通過）</em>を押すと、マウスがバーを通過するようになります。" },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "コツ", title: "ライブ配信は巻き戻せないことが多い：役に立つ設定" })}
${checkList([
  "<strong>音声ソースを「{アプリ名} のみ」にする（macOS）：</strong>システムの通知が翻訳されないように、先にライブ配信を再生してから「設定 › 音声」で<em>リストを更新</em>を押し（リストには音を出しているアプリしか表示されません）、ライブ配信を再生しているブラウザーを選んで、それから「開始」を押します。Safari の項目名は<em>Safari と他のアプリ内の Web ページ のみ</em>です。新しいソースは次のセッションから適用されます。そのブラウザーのほかのタブの音も聞き取られるので、ほかのタブは消音にしてください。",
  "<strong>Windows ではまだアプリを 1 つだけ選ぶことはできません：</strong>視聴中はシステムの通知を消音にしてください。",
  "<strong>文を区切る間の長さ</strong>は 50〜800 ms で設定できます。短いほど字幕が早く表示され、長いほど文が途中で切れにくくなります。文が途中で切れる場合（話し手が言いよどんだり息継ぎをしたりするとき）は長めにしてみてください。変更は次のセッションから適用されます。",
  "<strong>文を見逃したら：</strong>バーをロックしているときは ⌃⌥PageUp（Windows：Ctrl+Alt+PageUp）で前の文を表示し、⌃⌥PageDown で戻ります。ロックしていないときはバーの上でスクロールし、<em>最新</em>を押すと現在の行に戻ります。どのプランでも、最新のセッションの文字起こしを表示、検索、コピーできます。新しいセッションを始めると置き換えられます（<a href=\"/ja/guide/history-and-export/\">履歴と書き出し</a>）。",
])}
${callout({ title: "長いライブ配信の翻訳時間。", text: "数えるのは翻訳した発話だけで、無音の時間は数えません。すでに読みたい言語で話されている文も数えません。Free は 10 日間のお試しで 1 日 30 分なので、長いライブ配信には Monthly（30 日ごとに 50 時間）、6 Months（30 日ごとに 100 時間）、Yearly（無制限）が必要です。<a href=\"/ja/pricing/\">料金</a>をご覧ください。" })}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "正直な限界", title: "ライブ配信に AI Translator が向いていないのは？", text: "限界を先に知っておけば、実りのないお試しをせずに済みます。" })}
${checkList([
  "<strong>スマホで見ている。</strong>AI Translator が動くのは macOS と Windows だけなので、スマホのアプリの中に字幕を表示することはできません。使うには、ライブ配信をパソコンで開いてください。",
  "<strong>あなたが配信者で、視聴者のために翻訳したい。</strong>アプリが作る字幕は、アプリを使っている本人が自分のパソコンのフローティングバーで読むためのものです。あなたのライブ配信に字幕や翻訳した音声を追加することはありません。",
  "<strong>ライブ配信を録画したい、動画をダウンロードしたい、動画ファイルから字幕ファイルを作りたい。</strong>アプリは音声や映像をディスクに録音・録画せず、動画ファイルも処理しません。残るのはテキストの文字起こしだけで、要約の機能もありません。",
  "<strong>音声が聞き取りにくい。</strong>BGM や雑音が大きいとき、複数の人が同時に話すときは、認識が悪くなり、翻訳も間違えやすくなります。",
  "<strong>Windows や性能の低いマシンで速さが必要。</strong>0.76〜1.03 秒の遅延は Mac M4 Pro、Standard パックで測定したものです。Windows は内蔵グラフィックスのノート PC 1 台での予備的な測定しかなく、もっと遅くなります（<a href=\"/ja/features/#performance\">測定の条件</a>）。",
  "<strong>ライブ配信が英語、中国語、日本語、韓国語、ベトナム語ではない。</strong>アプリが対応しているのはこの 5 言語だけです。タイ語、インドネシア語などのライブ配信は、今のところ翻訳できません。",
], true)}
${callout({ kind: "warn", title: "機械翻訳は間違えることがあります。", text: "重要な判断（購入、契約、医療、法律、金融）では、専門家に確認せずに AI Translator に頼らないでください。" })}
<p>ブラウザーで再生した動画で動作を確認しました。個々のライブ配信プラットフォームでは試していません。</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "よくある質問", title: "ライブ配信の翻訳：よくある質問" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "続けて読む", title: "次のステップ", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ja/solutions/tiktok-live-translation/", icon: "play", title: "TikTok ライブを翻訳する", text: "パソコンのブラウザーで TikTok ライブを翻訳字幕付きで見る方法と、TikTok ライブならではの限界。", more: "ガイドを見る" })}
${linkCard({ href: "/ja/solutions/webinar-and-video-translation/", icon: "book", title: "ウェビナー、講座、動画", text: "何時間にもわたるセッションを含む、ほかの言語の録画コンテンツ。", more: "ソリューションを見る" })}
${linkCard({ href: "/ja/guide/quick-start/", icon: "zap", title: "クイックスタート", text: "インストールから最初の字幕まで。", more: "ガイドを開く" })}
</div>
<p class="center-text reveal">見ている内容がどこかに送られるのか気になりますか？<a href="/ja/data-security/">データとセキュリティ</a>をご覧ください。</p>
<p class="disclaimer">TikTok、YouTube、Facebook などの製品名は各所有者に帰属します。AI Translator はこれらの企業と提携していません。</p>
</div></section>

${ctaBand({ title: "次のライブ配信で試してみてください", text: "コマンド 1 つでインストールし、10 日間、1 日 30 分まで Free で試せます。カードもアカウントも不要です。", primary: { href: "/ja/download/", label: "ダウンロード" }, secondary: { href: "/ja/pricing/", label: "料金を見る" } })}
`,
};
