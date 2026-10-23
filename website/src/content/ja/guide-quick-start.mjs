import { pageHero, callout, appShot, overlayShot, facts, keys, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ガイド", path: "/ja/guide/" },
  { name: "クイックスタート", path: "/ja/guide/quick-start/" },
];

const toc = [
  { level: 2, id: "what-you-need", text: "必要なもの" },
  { level: 2, id: "install-and-open", text: "アプリをインストールして開く" },
  { level: 2, id: "first-time-setup", text: "7 つの手順で初期設定" },
  { level: 2, id: "first-meeting", text: "最初の会議を翻訳する" },
  { level: 2, id: "common-problems", text: "初回によくある問題" },
];

// HowTo の構造化データ用のプレーンテキスト。画面に表示する内容は body にあります。
const HOWTO_STEPS = [
  { name: "アプリをインストールして開く", text: "macOS では、インストールのコマンド（curl -fsSL https://aitranslator.vn/install.sh | bash）をターミナルに貼り付けます。アプリがダウンロードされ、確認されて、そのまま開きます。「このまま開く」は不要です。Windows では、インストールのコマンド（irm https://aitranslator.vn/install.ps1 | iex）を PowerShell に貼り付けます。ブラウザーでダウンロードした .exe を使い、SmartScreen が警告した場合は、「詳細情報」を押してから「実行」を押します。" },
  { name: "表示言語を選ぶ", text: "パソコンの言語が最初から選ばれています。必要なら変更して「次へ」を押します。これは翻訳先の言語の初期値にもなります。" },
  { name: "利用条件に同意する", text: "使用許諾契約（EULA）とプライバシーポリシーを読み、チェックを入れて「次へ」を押します。Free お試しを始めるために、一度だけインターネット接続が必要です。" },
  { name: "モデルを選んでダウンロードする", text: "アプリのおすすめに従って Standard パック（約 2.5 GB）か Lite パック（約 1.3 GB）を選び、ダウンロードを待ちます。" },
  { name: "システムオーディオの録音を許可する（macOS のみ）", text: "macOS がシステムオーディオの録音の許可を求めたら、許可します。アプリはマイクを使いません。Windows にはこの手順はありません。" },
  { name: "言語を選ぶ", text: "「翻訳先の言語」で読みたい言語を選び、会議で話される可能性のある言語を選びます。" },
  { name: "試してみる", text: "「サンプル文を再生」を押し、字幕バーに字幕が表示されるのを確認します。" },
  { name: "注意事項を読んで完了する", text: "プライバシーについての注意と、メニューバー（macOS）またはシステムトレイ（Windows）についての注意を読み、「AI Translator を使い始める」を押します。" },
  { name: "最初の会議を翻訳する", text: "音が出る会議や動画を開き、「開始」を押して、フローティングバーの字幕を読みます。終わったら「停止」を押し、必要なら文字起こしを開きます。" },
];

export default {
  id: "guide-quick-start",
  lang: "ja",
  path: "/ja/guide/quick-start/",
  title: "AI Translator クイックスタート（macOS・Windows）",
  description:
    "macOS と Windows での AI Translator のクイックスタート：アプリのインストール、モデルのダウンロード、サンプル文の確認、最初の会議のリアルタイム翻訳。",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "AI Translator をインストールして最初の会議を翻訳する",
      description: "インストーラーから最初の翻訳字幕までの手順：インストール、初期設定、翻訳の開始。",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator クイックスタート",
  lead: "AI Translator を初めて使うときは、アプリをインストールし、一度だけの初期設定（言語、利用条件、モデルのダウンロード、macOS での音声の許可、サンプル文）を済ませてから、会議の音が出ているときに「開始」を押します。翻訳字幕はフローティングバーに表示され、音声認識も翻訳もあなた自身のパソコンで動きます。",
  meta: "<span>macOS 14.2 以降（Apple シリコン）と Windows 10/11 64 ビット向け</span> <span>更新日 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "このガイドの内容",
  body: `
<h2 id="what-you-need">必要なもの</h2>
${facts([
  ["macOS", "14.2 以降、Apple シリコン（M1 以降）<small>Intel Mac 版はまだありません。</small>"],
  ["Windows", "Windows 10 または 11、64 ビット（x64）、AVX2 対応の CPU<small>Windows ARM64 にはまだ対応していません。</small>"],
  ["メモリ", "最低 8 GB、16 GB 推奨"],
  ["インストーラー", "macOS：約 9 MB の .dmg ファイル · Windows：約 22 MB の .exe ファイル<small>どちらも<a href=\"/ja/download/\">ダウンロード</a>ページのコマンド 1 つでインストールできます</small>"],
  ["ディスク容量", "1.3 GB（Lite パック）または 2.5 GB（Standard パック）<small>モデルのダウンロード中は、さらに 1 GB の空きが必要です</small>"],
  ["インターネット", "モデルのダウンロードと Free お試しの登録に必要<small>その後、認識と翻訳はオフラインで動きます</small>"],
])}
${callout({ title: "Windows をお使いですか？", text: "以下の手順は Windows でもほぼ同じですが、いくつか違いがあります：PowerShell のコマンドでインストールします（.exe ファイルも使えますが、Windows 版はまだコード署名されていないため、SmartScreen が警告することがあります）。音声の許可の手順はなく、アプリはメニューバーではなくシステムトレイにあり、ショートカットは ⌃⌥ の代わりに Ctrl+Alt を使います。" })}

<h2 id="install-and-open">アプリをインストールして開く</h2>
<p><strong>macOS の場合：</strong></p>
<ol>
<li><strong>ターミナル</strong>を開きます（<kbd>⌘</kbd> + <kbd>Space</kbd> を押し、「ターミナル」と入力して Enter を押します）。</li>
<li><a href="/ja/download/#install-macos">ダウンロード</a>ページのインストールのコマンドを貼り付けて Enter を押します：<code>curl -fsSL https://aitranslator.vn/install.sh | bash</code>。</li>
<li>1 分ほど待ちます。アプリがダウンロードされ、確認され、アプリケーションフォルダーにコピーされて、そのまま開きます。macOS がシステムオーディオの録音の許可を求めたら、「許可」を選びます。</li>
</ol>
<p>すでにブラウザーで <code>.dmg</code> をダウンロードしている場合：<strong>AI Translator</strong> を<strong>アプリケーション</strong>にドラッグして開きます（現在のビルドはアドホック署名でまだ Apple の公証を受けていないため、初回起動は macOS にブロックされます）。<strong>完了</strong>を押し、<strong>システム設定 › プライバシーとセキュリティ</strong>を開いていちばん下までスクロールし、<strong>このまま開く</strong>を押して、パスワードか Touch ID で確定します。</p>
<p><strong>Windows の場合：</strong></p>
<ol>
<li><strong>PowerShell</strong> を開きます（<kbd>Windows</kbd> キーを押し、「PowerShell」と入力して Enter を押します）。</li>
<li><a href="/ja/download/#install-windows">ダウンロード</a>ページのインストールのコマンドを貼り付けて Enter を押します：<code>irm https://aitranslator.vn/install.ps1 | iex</code>。管理者権限は不要です。</li>
<li>1 分ほど待ちます。インストーラーが画面に何も出さずに実行され、AI Translator が自動で開きます。</li>
</ol>
<p>すでにブラウザーで <code>.exe</code> をダウンロードしている場合：ダブルクリックします。Windows に青い「Windows によって PC が保護されました」の画面が表示されたら、<strong>詳細情報</strong>を押し、「アプリ」の行にインストーラーのファイル名が表示されていることを確かめてから、<strong>実行</strong>を押します。</p>
<p>インストーラーの SHA-256 を確認する方法など、詳しくは <a href="/ja/guide/install-macos/">macOS</a> と <a href="/ja/guide/install-windows/">Windows</a> へのインストールのガイドをご覧ください。</p>

<h2 id="first-time-setup">7 つの手順で初期設定</h2>
<p>初めて起動すると、ウィンドウ中央のカードに 9 画面の設定ウィザードが表示されます。上部にはロゴ、「ステップ 1 / 9」、進捗バーがあり、下部には<strong>戻る</strong>と<strong>次へ</strong>があります。このガイドではそれを 7 つの手順にまとめています。Windows には音声の許可の画面がないため、ウィザードは 8 画面です。下のスクリーンショットのステップ番号は macOS のものです。</p>

<h3>手順 1. 表示言語を選ぶ</h3>
<p>パソコンの言語が最初から選ばれています：<strong>Tiếng Việt</strong>、<strong>English</strong>、<strong>日本語</strong>、<strong>中文</strong>（簡体字中国語）、<strong>한국어</strong>。パソコンがそれ以外の言語の場合は English が選ばれます。必要なら変更して「次へ」を押します。これは字幕を読む言語にもなり、手順 5 でもう一度変更できます。</p>
${appShot({ slug: "app-onboarding-1", lang: "ja", alt: "設定ウィザードの最初の画面。Tiếng Việt、English、日本語、中文、한국어 の 5 つの表示言語から選ぶ", caption: "ステップ 1 / 9：表示言語。" })}

<h3>手順 2. 利用条件に同意する</h3>
<p>使用許諾契約（EULA）とプライバシーポリシーを読み、「使用許諾契約（EULA）とプライバシーポリシーを読み、同意します。」にチェックを入れます。チェックを入れるまで「次へ」は押せません。どちらの文書もベトナム語版と英語版があり、表示言語が日本語、中国語、韓国語の場合は、短い注記とともに英語版が表示されます。同じ画面には、アプリでエラーが起きたときにエラーレポートを自動で送るための任意のチェックボックスがあり、初期設定でチェックが入っています（音声や文字起こしのテキストは含みません）。送りたくない場合はチェックを外し、あとで「設定 › プライバシー」で変更できます。「次へ」を押すと、アプリはこのパソコンの Free お試しをサーバーに登録するので、一度だけインターネット接続が必要です。</p>
${appShot({ slug: "app-onboarding-2", lang: "ja", alt: "利用条件の手順。折りたためる 2 つの文書、必須の同意のチェックボックス、最初からチェックの入った任意のエラーレポート自動送信のチェックボックス", caption: "ステップ 2 / 9：利用条件。" })}

<h3>手順 3. モデルを選んでダウンロードする</h3>
<p>アプリはメモリとディスクの空き容量を表示し、パックをおすすめします：RAM が約 16 GB 以上の Mac（または 16 GB 以上で VRAM 6 GB の独立グラフィックスカードを搭載した Windows PC）には <strong>Standard</strong> パック（約 2.5 GB）、それ以外のパソコンには <strong>Lite</strong> パック（約 1.3 GB）です。パックを選ぶと次の画面でダウンロードが始まり、「一時停止」と「再開」のボタンがあります。ダウンロード中でも「次へ」を押せ、モデルはバックグラウンドでダウンロードを続けます。終わると「ダウンロードが完了しました。AI Translator で翻訳できます。」と表示されます。</p>
<div class="grid grid-2">
${appShot({ slug: "app-onboarding-3", lang: "ja", alt: "パソコンの確認の手順。メモリ、ディスクの空き容量、おすすめのモデルパックを表示", caption: "ステップ 3 / 9：このパソコンを確認し、パックを選ぶ。" })}
${appShot({ slug: "app-onboarding-4", lang: "ja", alt: "モデルのダウンロードの手順。進捗バーと一時停止ボタン", caption: "ステップ 4 / 9：モデルをダウンロード。" })}
</div>

<h3>手順 4. システムオーディオの録音を許可する（macOS のみ）</h3>
<p>AI Translator が初めて音声を取り込むとき、macOS は<strong>システムオーディオの録音</strong>の許可を求めます。この画面は前もって知らせるだけで、macOS の確認は、次の「試してみる」の手順か、初めて「開始」を押したときに表示されます。許可してください。間違えて拒否した場合は、この画面の<strong>システム設定を開く</strong>ボタンで該当する場所に移動できます。アプリはマイクを使いません。詳しくは<a href="/ja/guide/macos-audio-permission/">システムオーディオの録音の許可</a>をご覧ください。Windows にはこの手順はありません。</p>
${appShot({ slug: "app-onboarding-5", lang: "ja", alt: "システムオーディオの録音を許可する手順と、システム設定を開くボタン", caption: "ステップ 5 / 9：システムオーディオの録音の許可（macOS のみ）。" })}

<h3>手順 5. 言語を選ぶ</h3>
<p><strong>翻訳先の言語</strong>で、読みたい言語を選びます。会議で話される可能性のある言語にチェックを入れます（初期設定では 5 つすべて）。<strong>音声の言語</strong>は「自動検出」のままにするか、会議で使われる言語が 1 つだけとわかっていれば固定します。</p>
${appShot({ slug: "app-onboarding-6", lang: "ja", alt: "言語を選ぶ手順。翻訳先の言語のメニュー、話される言語の 5 つの丸いチップ、音声の言語のメニュー", caption: "ステップ 6 / 9：言語を選ぶ。" })}

<h3>手順 6. 試してみる</h3>
<p><strong>サンプル文を再生</strong>を押します。アプリがスピーカーから英語の文を再生し、その字幕が字幕バーに表示され、この画面に「動作しています。翻訳：…」と表示されます。Mac が消音になっている場合は音量を上げてください。この時点で macOS が録音の許可を求めたら、許可します。</p>
${appShot({ slug: "app-onboarding-7", lang: "ja", alt: "試してみる手順と、サンプル文を再生ボタン", caption: "ステップ 7 / 9：試してみる。" })}

<h3>手順 7. 注意事項を読んで完了する</h3>
<p>音声がこのパソコンの外に出ることはありません。法律や会社の規則で必要な場合、翻訳ツールを使っていることをほかの参加者に伝えるのはあなたの責任です。ウィンドウを閉じても、アプリはメニューバー（macOS）またはシステムトレイ（Windows）に隠れるだけです。Windows では、新しいアイコンがタスクバーの ^ 矢印の中に隠れていることがあり、最後の画面でその出し方を説明しています。<strong>AI Translator を使い始める</strong>を押すとホーム画面に進みます。</p>
<div class="grid grid-2">
${appShot({ slug: "app-onboarding-8", lang: "ja", alt: "プライバシーの手順。音声がパソコンの外に出ないことと、必要な場合はほかの参加者に伝えることを説明", caption: "ステップ 8 / 9：プライバシー。" })}
${appShot({ slug: "app-onboarding-9", lang: "ja", alt: "最後の手順。ウィンドウを閉じても AI Translator はメニューバーで動作し続けることを説明", caption: "ステップ 9 / 9：メニューバーで動作し続けます。" })}
</div>

<h2 id="first-meeting">最初の会議を翻訳する</h2>
<p>メインウィンドウの左のサイドバーにある各画面にはアイコンがあります。ウィンドウの幅が狭いとアイコンだけが表示され、マウスを重ねると名前が表示されます。</p>
<ol>
<li>ホーム画面の<strong>言語</strong>カードで、「翻訳先の言語」と「会議で話される言語」を確認します。</li>
<li><strong>音声ソース</strong>カードは初期設定で「システム全体（このアプリを除く）」です。1 つのアプリだけを翻訳するには<strong>変更</strong>を押します。Windows では、音声ソースは既定の再生デバイスか、選んだデバイスです。1 つのアプリだけを選ぶ機能はまだありません。</li>
<li>音が出る会議や動画を開いて<strong>開始</strong>を押します（または ${keys(["⌃", "⌥", "T"])} を押します。Windows では ${keys(["Ctrl", "Alt", "T"])}）。状態が「起動中」から「翻訳中」に変わります。最初の数秒は、バーに「モデルを読み込み中…」と表示されることがあります。</li>
<li>フローティングバーの字幕を読みます。音が届くとバーの右上の小さな点が緑になり、ホーム画面の「入力レベル」のバーもそれに合わせて動きます。薄い色の行は仮の字幕で、文ができあがると置き換わります。</li>
<li>終わったら<strong>停止</strong>を押します。読み終えられるようにバーには最後の行が残り、<strong>文字起こしを開く</strong>が表示されて、時刻、原文、翻訳を確認できます。<strong>すべてコピー</strong>はどのプランでも使えます。</li>
</ol>
${appShot({ slug: "app-home-running", lang: "ja", alt: "翻訳中のメイン画面：翻訳中の状態、停止ボタン、言語のカード、入力レベルのバー", caption: "翻訳中のホーム画面。" })}
<p>バーのドラッグ、ロック、非表示、見た目の変更については、<a href="/ja/guide/subtitle-bar-and-shortcuts/">字幕バーとショートカットのガイド</a>で説明しています。Free プランでは、10 日間のお試し期間中、1 日 30 分まで翻訳できます。</p>
${overlayShot({ slug: "overlay-default", lang: "ja", alt: "会議の画面の上に、原文を小さく、その下に翻訳を表示している初期設定の字幕バー", caption: "初期設定の字幕バー：上に小さく原文、下に翻訳。" })}

<h2 id="common-problems">初回によくある問題</h2>
<ul>
<li><strong>macOS でアプリが開かない。</strong>ターミナルでインストールのコマンドを実行する（アプリがそのまま開きます）か、上の「このまま開く」の手順を行います。詳しくは<a href="/ja/guide/install-macos/">インストールのガイド</a>をご覧ください。</li>
<li><strong>Windows に「Windows によって PC が保護されました」と表示される。</strong>「詳細情報」を押してから「実行」を押します。詳しくは <a href="/ja/guide/install-windows/">Windows へのインストールのガイド</a>をご覧ください。</li>
<li><strong>字幕が出ず、ホーム画面に「アプリから音が出ているのに何も聞こえません…」と表示される（macOS）。</strong>macOS がシステムオーディオの録音を許可していません。<a href="/ja/guide/macos-audio-permission/">許可のガイド</a>をご覧ください。</li>
<li><strong>サンプル文の字幕が表示されない。</strong>スピーカーが消音になっていないか確かめてから、もう一度試してください。</li>
<li><strong>モデルのダウンロードが途中で止まる。</strong><strong>再開</strong>を押すと、止まったところから続けます。</li>
<li><strong>字幕バーが見えない。</strong>非表示になっている可能性があります。字幕バーのカードで<strong>表示</strong>を押すか、${keys(["⌃", "⌥", "H"])} を押します（Windows：${keys(["Ctrl", "Alt", "H"])}）。</li>
<li><strong>初回の起動に時間がかかる。</strong>インストールや更新のあとは、「初回の準備をしています。数分かかることがあります。」と表示されることがあります。</li>
</ul>
<p>そのほかの問題は<a href="/ja/guide/troubleshooting/">トラブルシューティング</a>で説明しています。</p>

${docNav(
  [
    { href: "/ja/guide/", kicker: "すべてのガイド", title: "AI Translator の使い方ガイド" },
    { href: "/ja/guide/install-macos/", kicker: "次へ", title: "AI Translator を macOS にインストール" },
    { href: "/ja/guide/subtitle-bar-and-shortcuts/", kicker: "関連", title: "字幕バーとショートカット" },
  ],
  "関連するガイド",
)}
`,
})}
</div></section>
`,
};
