import { pageHero, sectionHead, checkList, callout, ctaBand, appShot, overlayShot, facts, keys, steps, linkCard } from "../../build/components.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ソリューション", path: "/ja/solutions/" },
  { name: "オンライン会議", path: "/ja/solutions/online-meeting-translation/" },
];

export default {
  id: "solutions-meetings",
  lang: "ja",
  path: "/ja/solutions/online-meeting-translation/",
  title: "AI Translator：Zoom・Teams・Meet・Zalo の翻訳字幕",
  description:
    "AI Translator で Zoom、Teams、Google Meet、Zalo の通話にリアルタイムの翻訳字幕を。ボット不要、オフラインで動作。設定のコツと正直な限界。",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-24",
  body: () => `
${pageHero({
  crumbs,
  title: "オンライン会議の翻訳字幕（Zoom、Teams、Meet、Zalo）",
  lead: "AI Translator は、パソコンで再生されている音声を聞き取り、Zoom、Microsoft Teams、Google Meet、Zalo PC の通話にリアルタイムの翻訳字幕を表示します。招待するボットはなく、主催者が何かを有効にする必要もありません。音声認識も翻訳もあなた自身のマシンで動きます。",
  meta: "<span>更新日 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["対応アプリ", "Zoom、Microsoft Teams、Google Meet、Zalo PC<small>ボットもプラグインも不要。パソコンから音が出るアプリならどれでも取り込めます</small>"],
  ["言語", "英語、中国語、日本語、韓国語、ベトナム語<small>字幕は一方向で、選んだ言語に翻訳します</small>"],
  ["遅延", "中央値 0.76〜1.03 秒<small>Mac M4 Pro、Standard パック。性能の低いマシンではもっと遅くなります</small>"],
  ["プラットフォーム", "macOS 14.2 以降（Apple シリコン）と Windows 10/11 x64<small>Windows 版はまだコード署名されていないため、インストール時に SmartScreen が警告することがあります</small>"],
])}</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "課題", title: "外国語の会議はなぜ疲れるのか？" })}
<p>外国語で行われる会議では、聞きながら頭の中で翻訳もするので、相手が早口だったり専門用語が多かったりすると、要点を聞き逃しがちです。大手の会議プラットフォームには翻訳字幕が組み込まれていますが、たいてい上位の有料プランに含まれ、音声をクラウドで処理します。多くのサードパーティのツールもクラウドで動きます。組織のプランにその機能が含まれていない場合や、会議の音声をパソコンの外に出したくない場合は、別の方法が必要です。</p>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-home-running", lang: "ja", alt: "翻訳中の AI Translator のメイン画面：翻訳中の状態、言語、音声ソース、翻訳の残り時間", caption: "翻訳中のメイン画面。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">しくみ</span>
<h2>AI Translator は聞く側で動きます</h2>
${checkList([
  "パソコンで再生されている音を取り込みます（macOS では<em>システムオーディオの録音</em>を許可します。会議室の発言者にはマイクを入力元に加えます。<a href=\"/ja/guide/macos-audio-permission/\">許可の与え方</a>をご覧ください）",
  "音声を文に区切り、マシン上で動くモデルで音声を認識して翻訳します",
  "翻訳はフローティング字幕バーに表示され、会議アプリからフォーカスを奪わないので、チャットへの入力を続けられます",
  "ほかの人は何もする必要がありません：会議室にボットは入らず、主催者が字幕を有効にする必要もありません",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "会議の前に", title: "5 分の準備", center: true })}
<div class="split wide-right">
<div>
${appShot({ slug: "app-settings-audio", lang: "ja", alt: "音声の設定：入力元は「コンピューターの音声 + マイク」、音声ソース（Zoom のみ）、マイクの選択、マイクの音量を下げる説明、「マイクのノイズを除去」スイッチ、100 ms に設定された文を区切る間の長さのスライダー", caption: "設定 › 音声：システム全体を聞き取るか、1 つのアプリだけを聞き取るか。" })}
</div>
<div>
${steps(
  [
    { title: "わかっていれば音声の言語を固定する", text: "言語のカードで、<em>音声の言語</em>を<em>自動検出</em>ではなく会議の言語にします。短い文で言語を取り違えることが減ります。複数の言語が話される場合は自動検出のままにし、出てくる可能性のある言語だけにチェックを入れます。" },
    { title: "固有名詞を用語集に追加する（Pro）", text: "取引先の名前、製品名、略語を、希望する訳とともに最大 500 件まで入力します。これは翻訳へのヒントであり、必ずその訳になるとは限りません。<a href=\"/ja/guide/glossary/\">用語集のガイド</a>をご覧ください。" },
    { title: "字幕バーを配置してロックする", text: "話している人を隠さない位置、たいていは映像のすぐ下にドラッグします。文字の大きさ（14〜48 px）、色、不透明度は「設定 › 字幕」で設定します。<em>ロック（クリックを通過）</em>を押すと、マウスがバーを通過するようになります。" },
    { title: "Zoom の音だけを聞き取る（macOS）", text: "「設定 › 音声」のリストには音を出しているアプリしか表示されないので、通話に参加してから<em>リストを更新</em>を押します。Zoom の項目（<em>{アプリ名} のみ</em>と表示されます）を選ぶと、通知音やほかの動画は翻訳されません。ブラウザーで Meet を使う場合はブラウザーを選びます（ほかのタブの音も聞き取られます）。次のセッションから反映されます。" },
  ],
  true,
)}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "会議中", title: "通話から離れずに操作する", text: "モデルの読み込みが終わるよう、会議が始まる前に「開始」を押しておきます（2 回目以降は数秒。インストールや更新の直後の初回は長めで、数分かかることもあります）。無音の時間は翻訳時間に数えられません。", center: true })}
${overlayShot({ slug: "overlay-default", lang: "ja", alt: "原文を上に小さく、その下に日本語訳を表示している AI Translator の字幕バー", caption: "字幕バー：上に小さく原文、下に翻訳。" })}
<div class="split">
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">操作</th><th scope="col">macOS</th></tr></thead>
<tbody>
<tr><th scope="row">翻訳の開始・停止</th><td>${keys(["⌃", "⌥", "T"])}</td></tr>
<tr><th scope="row">字幕の表示・非表示</th><td>${keys(["⌃", "⌥", "H"])}</td></tr>
<tr><th scope="row">ロック・ロック解除</th><td>${keys(["⌃", "⌥", "L"])}</td></tr>
<tr><th scope="row">上にスクロール（前の文）</th><td>${keys(["⌃", "⌥", "PageUp"])}</td></tr>
<tr><th scope="row">下にスクロール（新しい文）</th><td>${keys(["⌃", "⌥", "PageDown"])}</td></tr>
</tbody></table></div>
<div class="stack reveal">
${checkList([
  "<strong>聞き逃した文：</strong>上にスクロールして読み返せます（直近の 1000 文が残ります）。<em>最新</em>ボタンで元に戻り、スクロールのキーはバーをロックしていても使えます。",
  "<strong>薄く表示される文字</strong>は仮の字幕で、話が続くと置き換わります。名前や数字を確かめられるよう、<em>翻訳の上に原文を表示</em>はオンのままにしておきます（初期設定でオン）。",
  "<strong>すばやく隠すには</strong>ショートカットを使います（翻訳は続きます）。ロックしていないバーの ✕ ボタンを押すと、字幕を閉じて翻訳を停止します。",
])}
</div>
</div>
<p class="small muted">Windows では、ショートカットは ⌃⌥ の代わりに Ctrl+Alt を使います。会議アプリとぶつかる場合は「設定 › ショートカット」で変更してください。画面を共有するとき、共有する範囲に字幕バーが映るかどうかは確認していないので、先に試すか、共有中はバーを隠してください。<a href="/ja/guide/subtitle-bar-and-shortcuts/">字幕バーとショートカット</a>をご覧ください。</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "会議のあと", title: "必要なものを残す" })}
<p><strong>停止</strong>を押したあと、<strong>文字起こしを開く</strong>を押すと、すべての行を時刻、原文、翻訳とともに確認できます。検索欄（虫めがねのアイコン）と<em>すべてコピー</em>ボタンは、どのプランでも使えます。</p>
<p>TXT、SRT、Markdown への書き出しと履歴は Pro 機能です（<a href="/ja/pricing/">料金</a>をご覧ください）。履歴は初期設定でオフで、「設定 › プライバシー」でオンにすると、各セッションがパソコン上に暗号化して保存されます。アプリが文字起こしを勝手にディスクに保存することはなく、これは文字起こしのテキストであって、議事録ではありません。<a href="/ja/guide/history-and-export/">履歴と書き出し</a>をご覧ください。</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "テストした内容", title: "これまでに試したアプリとデバイス" })}
<p>別の音声取り込みテスト用ツール（アプリの認識と翻訳の一連の処理全体ではありません）を使い、macOS 26.6.2 で、<strong>Zoom（アプリ）</strong>、Chrome・Safari・Edge の <strong>Google Meet</strong>、<strong>Microsoft Teams（新しいアプリ）</strong>、<strong>Zalo PC</strong> のシステム音声の取り込みを、スピーカー、有線ヘッドホン、AirPods でテストしました。</p>
<p>これは社内テストで、テストした人が耳で確認したものです。アプリや macOS のバージョン（最低は 14.2）ごとに、リリースビルドで正式な受け入れテストを行ったものではありません。</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "プライバシー", title: "プライバシーとほかの参加者への通知" })}
<p>AI Translator はパソコンで再生されている音を取り込むので、そこにはほかの人の声も含まれます。音声はメモリ上にとどまり、ディスクに書き込まれず、ネットワークにも送られません（macOS でプロキシを使って確認しました）。アプリは会議を録音しません。<a href="/ja/data-security/">データとセキュリティ</a>をご覧ください。</p>
${callout({ title: "ほかの参加者には通知されません。", text: "ボットがなく、アプリは会議プラットフォームに接続しないため、ほかの参加者には、あなたが AI Translator を使っていることを知らせる表示は何も出ません。法律や会社の規則で必要な場合、翻訳ツールを使っていることをほかの参加者に伝えるのはあなたの責任です。<a href=\"/en/terms/\">利用規約（英語）</a>の第 6 節にも同じことが書かれています。私たちは法的な助言は行いません。" })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "正直な限界", title: "知っておいていただきたいこと" })}
${checkList([
  "<strong>遅延：</strong>中央値 0.76〜1.03 秒、p90 は 0.94〜1.34 秒で、24 GB の Mac M4 Pro、Standard パックで測定しました。性能の低いマシンでは遅延が大きくなります。M1 の Mac では測定しておらず、内蔵グラフィックスの Windows ノート PC 1 台では、Standard パックが目標に届きませんでした。<a href=\"/ja/features/\">測定の条件</a>をご覧ください。",
  "<strong>品質は</strong>言語や音声の聞き取りやすさによって変わります。ベトナム語、日本語、韓国語、中国語では、Lite パックは Standard より文字起こしの精度が下がります。実際の Bluetooth ヘッドセット経由での精度は測定していません。",
  "<strong>翻訳は間違えることがあります。</strong>特に専門用語や固有名詞です。重要な判断には、専門家に確認せずに頼らないでください。",
], true)}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "続けて読む", title: "次のステップ", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ja/guide/quick-start/", icon: "zap", title: "クイックスタート", text: "インストールから最初の字幕まで。", more: "ガイドを開く" })}
${linkCard({ href: "/ja/compare/offline-vs-cloud-translation/", icon: "layers", title: "オフライン翻訳とクラウド翻訳", text: "2 つの方法を公平に比較。", more: "比較を読む" })}
${linkCard({ href: "/ja/solutions/webinar-and-video-translation/", icon: "play", title: "ウェビナーと動画", text: "カンファレンスの講演、講座、講義。", more: "ソリューションを見る" })}
</div>
</div></section>

${ctaBand({ title: "ご自身の通話で試してみてください", text: "まずは 10 日間の無料お試しから。1 日 30 分まで、カードもアカウントも不要です。", primary: { href: "/ja/download/", label: "ダウンロード" }, secondary: { href: "/ja/guide/quick-start/", label: "クイックスタートガイド" } })}
`,
};
