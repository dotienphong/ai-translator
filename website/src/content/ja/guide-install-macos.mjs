import { pageHero, callout, facts, docLayout, docNav, cmdBlock } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ガイド", path: "/ja/guide/" },
  { name: "macOS にインストール", path: "/ja/guide/install-macos/" },
];

const toc = [
  { level: 2, id: "requirements", text: "お使いの Mac で動きますか？" },
  { level: 2, id: "install-command", text: "かんたんな方法：コマンド 1 つでインストール" },
  { level: 2, id: "install-dmg", text: "別の方法：.dmg ファイルからインストール" },
  { level: 3, id: "verify-the-file", text: "インストーラーを確認する（SHA-256）" },
  { level: 3, id: "drag-to-applications", text: "アプリケーションにドラッグする" },
  { level: 3, id: "first-launch", text: "初回起動：macOS がブロックする理由" },
  { level: 2, id: "updates", text: "更新のたびに" },
  { level: 2, id: "uninstall", text: "正しくアンインストールする" },
  { level: 2, id: "common-problems", text: "インストールでよくある問題" },
];

const INSTALL_CMD = "curl -fsSL https://aitranslator.vn/install.sh | bash";

const HOWTO_STEPS = [
  { name: "ターミナルを開く", text: "Command + Space を押し、「ターミナル」と入力して Enter を押します。" },
  { name: "インストールのコマンドを貼り付けて Enter を押す", text: "curl -fsSL https://aitranslator.vn/install.sh | bash をターミナルに貼り付けて Enter を押します。パスワードは不要です。" },
  { name: "アプリが開くのを待つ", text: "コマンドが最新版をダウンロードし、SHA-256 を確認して、AI Translator をアプリケーションにコピーして開きます。macOS がシステムオーディオの録音の許可を求めたら、「許可」を選びます。" },
];

export default {
  id: "guide-install-macos",
  lang: "ja",
  path: "/ja/guide/install-macos/",
  title: "AI Translator を macOS にインストール",
  description:
    "ターミナルのコマンド 1 つでダウンロード、確認、起動まで。「このまま開く」は不要です。.dmg からのインストール、SHA-256 の確認、更新、アンインストールも説明します。",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "コマンド 1 つで AI Translator を macOS にインストールして開く",
      description: "ターミナルにコマンドを 1 つ貼り付けると、AI Translator がダウンロード、確認、インストールされ、「このまま開く」の手順なしでそのまま開きます。",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator を macOS にインストール",
  lead: "macOS に AI Translator をインストールするいちばん早い方法は、ターミナルにコマンドを 1 つ貼り付けることです。アプリがダウンロードされ、確認されてすぐに開くので、システム設定で「このまま開く」を押しに行く必要はありません。すでにブラウザーで .dmg をダウンロードしている場合は、アプリケーションにドラッグしてインストールすることもできますが、現在のビルドはアドホック署名で Apple の公証を受けていないため、初回起動は macOS にブロックされます。",
  meta: "<span>macOS 14.2 以降、Apple シリコン向け</span> <span>更新日 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "このガイドの内容",
  body: `
<h2 id="requirements">お使いの Mac で動きますか？</h2>
${facts([
  ["チップ", "Apple シリコン（M1 以降）<small>Intel Mac 版はありません。チップは Apple メニュー › この Mac について で確認できます。</small>"],
  ["OS", "macOS 14.2 以降"],
  ["メモリ", "最低 8 GB、16 GB 推奨<small>8 GB 未満の場合、アプリは理由を説明し、モデルをダウンロードしません。</small>"],
  ["インストーラー", "約 9 MB の .dmg ファイル"],
  ["モデル用のディスク容量", "1.3 GB（Lite パック）または 2.5 GB（Standard パック）<small>ダウンロード中は、さらに 1 GB の空きが必要です。</small>"],
  ["インターネット", "モデルのダウンロードと Free お試しの登録に必要<small>その後、翻訳はオフラインで動きます。</small>"],
])}
<p class="small muted">ベースモデルの M1 Mac では性能を測定していないため、そこでの遅延はお約束できません。8 GB の Mac では Lite パックが妥当な選択です。</p>

<h2 id="install-command">かんたんな方法：コマンド 1 つでインストール</h2>
<ol>
<li><strong>ターミナル</strong>を開きます：<kbd>⌘</kbd> + <kbd>Space</kbd> を押し、<strong>ターミナル</strong>と入力して Enter を押します。</li>
<li>下のコマンドを貼り付けて Enter を押します。パスワードは不要です。</li>
</ol>
${cmdBlock({ cmd: INSTALL_CMD, copy: "コマンドをコピー", copied: "コピーしました", label: "macOS に AI Translator をインストールするコマンド" })}
<ol start="3">
<li>1 分ほど待ちます。コマンドが最新の AI Translator をダウンロードし、SHA-256 を照合し、アプリの署名を確認してから、アプリを <code>/Applications</code>（書き込めない場合は <code>~/Applications</code>）にコピーして開きます。</li>
<li>macOS が<strong>システムオーディオの録音</strong>の許可を求めたら、「許可」を選びます。続きは<a href="/ja/guide/quick-start/">クイックスタートガイド</a>をご覧ください。</li>
</ol>
<p><strong>なぜ「このまま開く」の手順がないのですか？</strong>macOS がブロックするのは、「インターネットからダウンロードした」という印（ブラウザーが付けます）が付いたファイルのアプリだけです。ターミナルの <code>curl</code> でダウンロードしたファイルにはこの印がないため、Apple の公証がなくてもアプリはそのまま開きます。</p>
${callout({ kind: "warn", title: "このコマンドが何をするのかを理解しておいてください。", text: "コマンドは <strong>aitranslator.vn</strong> からスクリプトをダウンロードし、そのスクリプトが <strong>releases.aitranslator.vn</strong> からインストーラーをダウンロードして、SHA-256 を照合してからインストールします。sudo は使わず、データを送ることもありません。SHA-256 はファイルと同じ場所から配信されるので、おもに壊れたダウンロードを防ぐためのものです。<strong>aitranslator.vn</strong> を信頼していることに変わりはありません。先にスクリプトを読むには：<code>curl -fsSL https://aitranslator.vn/install.sh -o install.sh && less install.sh && bash install.sh</code>。同じコマンドをいつでももう一度実行すれば、最新版に更新できます。スクリプトは実行中のアプリを自分で終了させます。" })}
<p>うまくいきませんでしたか？スクリプトは止まって理由を表示します（対応していない Mac、ネットワークがない、SHA-256 が一致しない…）。<a href="#common-problems">インストールでよくある問題</a>をご覧ください。</p>

<h2 id="install-dmg">別の方法：.dmg ファイルからインストール</h2>
<p>.dmg をメールで受け取った場合や、ターミナルを使いたくない場合はこの方法を使います。ブラウザーでダウンロードしたファイルには macOS が「インターネットからダウンロードした」という印を付けるため、初回起動には「このまま開く」の手順が追加で必要です。</p>

<h3 id="verify-the-file">インストーラーを確認する（SHA-256）</h3>
${callout({ kind: "warn", title: "インストーラーは公式の入手先からだけダウンロードしてください。", text: "本物の .dmg は、私たちが <strong>support@aitranslator.vn</strong> からお送りするもの、または <strong>aitranslator.vn</strong> にリンクがあるものです。それ以外の場所から入手したファイルは偽物や改ざんされたものの可能性があります。名前が AI Translator でも開かないでください。" })}
<p>メールでお送りするインストーラーには、すべて SHA-256 チェックサムを添えています。インストールする前に照合してください：</p>
<ol>
<li><strong>ターミナル</strong>を開きます（アプリケーション › ユーティリティ）。</li>
<li><code>shasum -a 256</code> と入力してスペースを 1 つ入れ、Finder から .dmg ファイルをターミナルのウィンドウにドラッグしてパスを入力し（ファイル名のスペースも含めて入ります）、Enter を押します。または下のコマンドを入力します。ファイル名にスペースが含まれる場合は、例のようにダブルクォーテーションで囲んでください。</li>
</ol>
<div class="table-wrap"><pre><code>shasum -a 256 ~/Downloads/"&lt;file-name&gt;.dmg"</code></pre></div>
<ol start="3">
<li>表示された 64 文字の文字列を、私たちがお送りしたものと比べます。完全に一致している必要があります。</li>
<li>一致しない場合はファイルを開かないでください。もう一度ダウンロードし、それでも一致しない場合は<a href="/ja/contact/">サポートにご連絡ください</a>。</li>
</ol>

<h3 id="drag-to-applications">AI Translator をアプリケーションにドラッグする</h3>
<ol>
<li><code>.dmg</code> ファイルをダブルクリックして開きます。</li>
<li>表示されたウィンドウで、<strong>AI Translator</strong> を<strong>アプリケーション</strong>フォルダーにドラッグします。</li>
</ol>

<h3 id="first-launch">初回起動：macOS がブロックする理由と許可の方法</h3>
<p>macOS は Gatekeeper を使って、インターネットからダウンロードしたアプリを確認します。現在の AI Translator のビルドはアドホック署名で、まだ Apple の公証を受けていません。Apple Developer ID をまだ持っていないためです。そのため macOS は初回起動をブロックし、開発元を確認できないと表示します。ファイルが私たちから届いたもので SHA-256 が一致していれば、このビルドではこれが通常の流れです。</p>
<ol>
<li>アプリケーションから AI Translator を開きます。macOS が開発元を確認できないと表示したら、<strong>完了</strong>を押します（ダイアログを閉じるボタンです。macOS のバージョンによって表記が少し異なることがあります）。</li>
<li><strong>システム設定 › プライバシーとセキュリティ</strong>を開きます。</li>
<li>ページのいちばん下までスクロールし、AI Translator の横にある<strong>このまま開く</strong>を押します。</li>
<li>ログインパスワードか Touch ID で確定します。</li>
<li>アプリが開き、初期設定が表示されます。続きは<a href="/ja/guide/quick-start/">クイックスタートガイド</a>をご覧ください。</li>
</ol>
${callout({ kind: "warn", title: "macOS 15 からは、右クリック › 開く の方法は使えません。", text: "上のように「プライバシーとセキュリティ」から操作してください。「このまま開く」ボタンは、たいてい macOS がアプリを開こうとした操作をブロックしたあとにだけ表示されます。見当たらない場合は、もう一度アプリを開いてから戻ってきてください。" })}
<p>この手順が必要なのは、ブラウザーでダウンロードした .dmg の場合だけです。<a href="#install-command">1 行のコマンド</a>でインストールした場合は不要です。Developer ID を取得してアプリの公証を受ければ、どの方法でインストールしてもこの手順はなくなります。</p>

<h2 id="updates">更新のたびに、macOS がもう一度確認すること</h2>
<p>まず、更新のしくみです：アプリは開いてから 1 分ほどで新しいバージョンを確認し、その後は 24 時間ごとに確認して、バックグラウンドでダウンロードします。準備ができると「再起動」か「後で」を尋ね（トレイのメニューにも「再起動して更新」があります）、再起動するか「終了」を選んだときに新しいバージョンがインストールされます。アップデートチャンネル（安定版または Beta）は「設定 › 一般」で選び、変更するとすぐに確認します。すぐに確認するには、「設定 › 一般」の<strong>アップデートを確認</strong>を押すか、アプリのアイコンのメニューから「アップデートを確認…」を選びます。</p>
<p>ここからはアドホック署名による影響です：新しいビルドは毎回署名が異なるため、macOS はキーチェーンへのアクセスをもう一度求めます。バージョン 0.1.1 から、AI Translator は機密データ（履歴の暗号鍵、ライセンストークン、翻訳時間のカウンター）をすべて<strong>1 つ</strong>のキーチェーン項目に保管しているので、更新のたびに次のものが表示されます：</p>
<ul>
<li>Mac のログインパスワードを求める<strong>キーチェーンのダイアログ 1 つ</strong>（macOS 26 の Mac 1 台で測定：新しいビルドを想定してアプリを 2 回署名し直したところ、どちらもダイアログは 1 つだけでした）：パスワードを入力して<strong>常に許可</strong>を選びます。「拒否」は選ばないでください。アプリがライセンスと翻訳時間を読めなくなります。間違えて選んだ場合は、アプリを完全に終了してから開き直し、「常に許可」を選んでください。</li>
<li><strong>システムオーディオの録音</strong>の許可をもう一度 1 回求められることがあります（以前の測定ではダイアログ 1 つでした）：許可してください。</li>
</ul>
<p><strong>0.1.0 から 0.1.1 への最初の更新だけ</strong>は違います：アプリが古いキーチェーン項目 5 つを新しい項目にコピーする必要があるため、キーチェーンのダイアログが一度だけ 5 つ表示されます（測定ではちょうど 5 つと、録音を許可するダイアログ 1 つでした）。それ以降の更新では 1 つだけです。</p>
<p>「常に許可」を選べば、以後の起動では聞かれません。データ、プラン、翻訳時間が失われることはありません。新規インストールではキーチェーンのダイアログは測定されませんでした（録音の許可と、ブラウザーでダウンロードした .dmg からインストールした場合の「このまま開く」だけです）。それでも macOS に聞かれた場合は「常に許可」を選んでください。アプリは更新の案内で前もってお知らせします。Developer ID を取得すれば、これはなくなります。同じインストールのコマンドで更新することもでき、その場合も同じ理由でキーチェーンのダイアログが表示されます。</p>

<h2 id="uninstall">正しくアンインストールする</h2>
<p>macOS は削除するときにアプリが後片付けをする機会を与えないので、先にモデルとデータを削除してから、アプリをゴミ箱に入れてください：</p>
<ol>
<li>AI Translator を開き、<strong>設定 › プライバシー</strong>に移動します。</li>
<li><strong>モデルとデータを削除</strong>を押し、<strong>すべて削除</strong>で確定します。アプリはダウンロードしたモデル（1.3 GB または 2.5 GB）、履歴、用語集をすべて削除します。</li>
<li>メニューバーの AI Translator のアイコンから<strong>終了</strong>を選びます。</li>
<li>アプリケーションから <strong>AI Translator</strong> をゴミ箱にドラッグします。</li>
</ol>
<p>ライセンスと残りの翻訳時間は残るので、もう一度インストールしても購入したプランは失われないはずです。Free お試しは Mac に結び付いているため、もう一度インストールしても 10 日間は元に戻りません。モデルを削除せずにアプリを削除してしまった場合、モデルは <code>~/Library/Application Support/com.aitranslator.desktop/models</code> にあります。</p>

<h2 id="common-problems">インストールでよくある問題</h2>
<ul>
<li><strong>インストールのコマンドが https://releases.aitranslator.vn/stable/latest.json を読み取れないと表示する。</strong>Mac がネットワークにつながっていないか、プロキシや VPN が <code>releases.aitranslator.vn</code> をブロックしています。接続を確認して、もう一度実行してください。</li>
<li><strong>インストールのコマンドが SHA-256 が一致しないと表示する。</strong>ダウンロードが途中で壊れたか、改ざんされました。スクリプトは何もインストールしません。もう一度実行し、それでも一致しない場合は<a href="/ja/contact/">サポート</a>にご連絡ください。</li>
<li><strong>インストールのコマンドがアプリがまだ実行中だと表示する。</strong>AI Translator を完全に終了し（メニューバーの AI Translator のメニュー › 終了）、もう一度コマンドを実行してください。</li>
<li><strong>インストールのコマンドが Apple シリコンか macOS 14.2 が必要だと表示する。</strong>お使いの Mac は要件を満たしていません。Intel Mac 向けのビルドはありません。</li>
<li><strong>「このまま開く」ボタンがない。</strong>（ブラウザーでダウンロードした .dmg からインストールした場合のみ。）macOS がブロックを記録するよう、もう一度アプリを開いてから「プライバシーとセキュリティ」に戻ってください。</li>
<li><strong>Intel Mac にインストールできない。</strong>AI Translator は Apple シリコン専用です。</li>
<li><strong>アプリに「このコンピューターの RAM は 8 GB 未満で、AI Translator はまだ対応していません。」と表示される。</strong>8 GB 未満の Mac ではモデルをダウンロードできません。</li>
<li><strong>アプリに「この AI Translator は正規品ではないため、Free のみ使用できます。」と表示される。</strong>インストールしたものが改変されているか、正しくない入手先から来ています。公式の入手先からもう一度ダウンロードしてください。</li>
<li><strong>更新のあと、macOS がキーチェーンについて何度も尋ねる。</strong>アドホック署名のビルドでは通常のことです。パスワードを入力して「常に許可」を選んでください。</li>
</ul>
<p>インストールしたあとに字幕が表示されない場合は、<a href="/ja/guide/macos-audio-permission/">システムオーディオの録音の許可の与え方</a>をご覧ください。</p>

${docNav(
  [
    { href: "/ja/guide/quick-start/", kicker: "前へ", title: "AI Translator クイックスタート" },
    { href: "/ja/guide/macos-audio-permission/", kicker: "次へ", title: "macOS でシステムオーディオの録音を許可する" },
    { href: "/ja/guide/troubleshooting/", kicker: "関連", title: "トラブルシューティング" },
  ],
  "関連するガイド",
)}
`,
})}
</div></section>
`,
};
