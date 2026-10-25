import { pageHero, sectionHead, feature, checkList, callout, ctaBand, appShot, overlayShot, facts, linkCard } from "../../build/components.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ソリューション", path: "/ja/solutions/" },
  { name: "ウェビナーと動画", path: "/ja/solutions/webinar-and-video-translation/" },
];

export default {
  id: "solutions-webinar",
  lang: "ja",
  path: "/ja/solutions/webinar-and-video-translation/",
  title: "ウェビナー・講座・動画の翻訳字幕",
  description:
    "AI Translator で、ほかの言語のウェビナー、講座、動画をリアルタイムの翻訳字幕を読みながら視聴。ブラウザーへの追加インストール不要、オフラインで動作。",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  body: () => `
${pageHero({
  crumbs,
  title: "ウェビナー、講座、動画の翻訳字幕",
  lead: "AI Translator は、ほかの言語のウェビナー、オンラインカンファレンス、講座、動画を見ているあいだ、画面に翻訳字幕を表示します。パソコンで再生されている音声を聞き取るので、ブラウザーやプラットフォームに何かをインストールする必要はなく、認識も翻訳もあなたのマシンで動きます。",
  meta: "<span>更新日 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["対応", "パソコンで音が出るものすべて<small>ブラウザー、メディアプレーヤー、講座のプラットフォーム、ウェビナーのツール</small>"],
  ["追加のインストール", "アプリ本体のほかは不要<small>ブラウザーの拡張機能も、プラグインも、サインイン用のアカウントも不要</small>"],
  ["言語", "英語、中国語、日本語、韓国語、ベトナム語<small>読みたい言語を選べます</small>"],
  ["長時間のセッション", "5 時間 23 分、エラーなしで動作<small>Mac M4 Pro、macOS、アドホック署名のリリースビルド、1 回のテスト</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "こんな方に", title: "内容はすばらしいのに、自分の言語ではないとき", center: true })}
<div class="grid grid-3">
${feature({ icon: "book", title: "オンラインで学ぶ人", text: "英語、中国語、日本語、韓国語の講座や講義の動画を、誰かが翻訳してくれるのを待たずに、今すぐ理解したい方。" })}
${feature({ icon: "users", title: "カンファレンスを聴講する人", text: "海外の講演者が登壇するウェビナーやオンラインカンファレンスを、話す必要はなく聞くだけの方。" })}
${feature({ icon: "play", title: "動画を見る人", text: "技術的な動画、講演、インタビューで、組み込みの字幕に自分の言語がない方。" })}
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "追加のインストールは不要", title: "プレーヤーやプラットフォームに左右されません" })}
<p>AI Translator はパソコンで再生されている音を取り込むので、見ているウェブサイトやプラットフォームに左右されません。<strong>開始</strong>を押してから動画を再生すると、プレーヤーのウィンドウの上にあるフローティングバーに翻訳字幕が表示されます。ブラウザーの動画では試しましたが、講座やウェビナーのプラットフォームを 1 つずつ試したわけではありません。AI Translator はリアルタイムの動画翻訳ツールとして動きます：パソコンのブラウザーやプレーヤーアプリで動画が再生されているあいだに音声を聞き取り、フローティングバーに字幕を表示します。動画ファイルを開いたり処理したりはしません：アップロードも吹き替えもなく、動画そのものに字幕を追加することもありません（セッションの文字起こしを SRT として書き出すことはできます。下記をご覧ください）。ライブ映像については<a href="/ja/solutions/livestream-translation/">ライブ配信の翻訳</a>をご覧ください。</p>
<p>macOS では、<em>システムオーディオの録音</em>の許可を一度与えるだけです。ウェビナーなら既定の入力元「コンピューターの音声」で足ります。<a href="/ja/guide/macos-audio-permission/">許可の与え方</a>をご覧ください。</p>
</div></section>

<section class="section"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">両方を読む</span>
<h2>原文と翻訳を同時に</h2>
<p>「設定 › 字幕」の<em>翻訳の上に原文を表示</em>（初期設定でオン）にすると、翻訳のすぐ上に元の文が小さく表示されます。語学を学んでいる方や、用語を確かめたい方に向いています。</p>
${checkList([
  "文字の大きさ 14〜48 px、文字色 5 色、背景色 5 色、不透明度を調整可能",
  "マウスホイールかショートカットで上にスクロールして前の文を読み返せます。<em>最新</em>ボタンで現在の行に戻ります",
  "<em>文を区切る間の長さ</em>は 50〜800 ms で設定できます。動画を見ていてすぐに反応する必要がないときは、長めにすると文が途中で切れにくくなります",
])}
</div>
<div>
${overlayShot({ slug: "overlay-custom", lang: "ja", alt: "大きな文字サイズで、紺色の背景に黄色の文字を表示した字幕バー", caption: "同じバーの見た目を変えたところ：紺色の背景に黄色の文字。" })}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "長時間のセッション", title: "長いイベントも途切れずに最後まで" })}
<p><strong>5 時間 23 分</strong>の連続したセッション（ブラウザーで再生した英語の講義動画）は、6,019 セグメント、エラーなし、遅延の中央値 0.48 秒で終わりました。条件：Mac M4 Pro、macOS、アドホック署名のリリースビルド、1 回の実行。正式な受け入れテストではありません。別に行った 2 時間の安定性テストでも、プロセスの再起動は一度もありませんでした。</p>
${callout({ title: "長いイベントの翻訳時間。", text: "数えるのは翻訳した発話だけで、無音の時間は数えません。すでに読みたい言語で話されている文も数えませんが、巻き戻して 2 回聞いた部分は数えます。Free は 10 日間のお試しで 1 日 30 分なので、長いウェビナーには Monthly（30 日ごとに 50 時間）、6 Months（30 日ごとに 100 時間）、Yearly（無制限）が必要です。<a href=\"/ja/pricing/\">料金</a>をご覧ください。" })}
</div></section>

<section class="section"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-transcript", lang: "ja", alt: "時刻、原文、翻訳のある文字起こし。検索欄、すべてコピーボタン、書き出し形式の選択", caption: "文字起こし：検索、コピー、TXT・SRT・Markdown への書き出し。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">復習する</span>
<h2>文字起こしを残してあとで見直す</h2>
${checkList([
  "文字起こし（時刻、原文、翻訳）の<strong>すべてコピー</strong>は、どのプランでも使えます",
  "<strong>TXT、SRT、Markdown への書き出し</strong>と履歴の保存は Pro 機能です",
  "<strong>TXT と Markdown</strong> には各文の時刻が記録されます。<strong>SRT</strong> には「開始」を押した時点からの時間が記録され、テキストとして翻訳か原文かを選べます",
])}
<p class="small muted">SRT は動画と同期していません。動画を 0 秒から再生するのとちょうど同時に「開始」を押した場合にだけ、時間がおおよそ合います。それ以外の場合は、お使いの字幕ツールで時間をずらしてください。<a href="/ja/guide/history-and-export/">履歴と書き出し</a>をご覧ください。</p>
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "専門的な講座", title: "専門的な内容には用語集を" })}
<p>医療、金融、プログラミングの講座には、翻訳が取り違えやすい用語がたくさんあります。<strong>用語集</strong>（Pro）に「原語 → 訳語」の組を追加しましょう：最大 500 件、CSV の読み込みと書き出しに対応、大文字と小文字は区別しません。アプリは一致した用語をヒントとして翻訳に渡すため、毎回必ずその訳になるとは限りません。<a href="/ja/guide/glossary/">用語集のガイド</a>をご覧ください。</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "コツ", title: "もっと快適に使うために" })}
${checkList([
  "<strong>音声ソースを「{アプリ名} のみ」にする（macOS）：</strong>「設定 › 音声」でブラウザーやメディアプレーヤーを選ぶと、ほかの音は翻訳されません。リストには音を出しているアプリしか表示されないので、先に動画を再生してから<em>リストを更新</em>を押します。",
  "<strong>視聴中はシステムの通知を消音にする：</strong>特に、まだアプリを 1 つだけ選ぶことができない Windows では効果的です。",
  "<strong>音声の言語を固定する：</strong>イベント全体が 1 つの言語のときに。話者が言語を切り替える場合は自動検出のままにします。",
  "<strong>再生する前に「開始」を押す：</strong>アプリは最初の数秒でモデルを読み込みます（インストールや更新の直後の初回は長めで、数分かかることもあります）。",
])}
<p>5 つの言語はどの方向にも翻訳できます。翻訳の品質を測定したのはベトナム語を含む組み合わせだけです。ほかの組み合わせ（たとえば英語から日本語）も動きますが、品質のスコアはまだありません。</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "正直な限界", title: "知っておいていただきたいこと" })}
${checkList([
  "<strong>翻訳は間違えることがあります。</strong>特に専門用語、固有名詞、聞き取りにくい発話です。重要な判断には、確認せずに頼らないでください。",
  "<strong>遅延</strong>は、Mac M4 Pro、Standard パックで中央値 0.76〜1.03 秒です。性能の低いマシンでは遅延が大きくなります。M1 の Mac では測定していません。反応する必要のない動画では、会議ほど遅延は気になりません。",
  "<strong>認識</strong>は、ベトナム語、日本語、韓国語、中国語では Lite パックのほうが精度が下がり、大きな音楽や雑音の下など、発話が聞き取りにくいときにも悪くなります。",
  "<strong>macOS</strong>（Apple シリコン、14.2 以降）<strong>と Windows 10/11</strong>（x64）で動きます。翻訳はフローティングバーにだけ表示され、動画に追加されることも、配信元の公式字幕を置き換えることもありません。",
], true)}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "続けて読む", title: "次のステップ", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ja/guide/quick-start/", icon: "zap", title: "クイックスタート", text: "インストールから最初の字幕まで。", more: "ガイドを開く" })}
${linkCard({ href: "/ja/solutions/online-meeting-translation/", icon: "users", title: "オンライン会議", text: "Zoom、Teams、Meet、Zalo 向け。", more: "ソリューションを見る" })}
${linkCard({ href: "/ja/features/", icon: "sliders", title: "機能", text: "すべての機能と性能の測定結果。", more: "機能を見る" })}
</div>
<p class="center-text reveal">見ている内容がどこに行くのか気になりますか？<a href="/ja/data-security/">データとセキュリティ</a>をお読みください。</p>
</div></section>

${ctaBand({ title: "ご自身の動画で試してみてください", text: "まずは 10 日間の無料お試しから。1 日 30 分まで、カードもアカウントも不要です。", primary: { href: "/ja/download/", label: "ダウンロード" }, secondary: { href: "/ja/pricing/", label: "料金を見る" } })}
`,
};
