import { pageHero, callout, facts, docLayout, docNav, cmdBlock } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ガイド", path: "/ja/guide/" },
  { name: "Windows にインストール", path: "/ja/guide/install-windows/" },
];

const toc = [
  { level: 2, id: "requirements", text: "お使いの PC で動きますか？" },
  { level: 2, id: "install-command", text: "かんたんな方法：コマンド 1 つでインストール" },
  { level: 2, id: "install-exe", text: "別の方法：.exe ファイルからインストール" },
  { level: 3, id: "verify-the-file", text: "インストーラーを確認する（SHA-256）" },
  { level: 3, id: "run-the-installer", text: "インストーラーを実行し、SmartScreen を通過する" },
  { level: 2, id: "smart-app-control", text: "Windows 11 でアプリがブロックされる（スマート アプリ コントロール）" },
  { level: 2, id: "first-launch", text: "初回起動" },
  { level: 2, id: "updates", text: "更新" },
  { level: 2, id: "uninstall", text: "正しくアンインストールする" },
  { level: 2, id: "common-problems", text: "インストールでよくある問題" },
];

const INSTALL_CMD = "irm https://aitranslator.vn/install.ps1 | iex";

const HOWTO_STEPS = [
  { name: "PowerShell を開く", text: "Windows キーを押し、PowerShell と入力して Enter を押します。管理者として実行する必要はありません。" },
  { name: "インストールのコマンドを貼り付けて Enter を押す", text: "irm https://aitranslator.vn/install.ps1 | iex を PowerShell に貼り付けて Enter を押します。" },
  { name: "アプリが開くのを待つ", text: "コマンドが最新版をダウンロードし、SHA-256 を確認し、あなたのアカウントだけにインストーラーを画面表示なしで実行して、AI Translator を開きます。" },
];

export default {
  id: "guide-install-windows",
  lang: "ja",
  path: "/ja/guide/install-windows/",
  title: "AI Translator を Windows にインストール",
  description:
    "PowerShell のコマンド 1 つで、ダウンロード、確認、あなたのアカウントへのインストールまで。SmartScreen の画面は出ません。.exe での方法、更新、アンインストールも説明します。",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-24",
  schema: [
    howTo({
      name: "コマンド 1 つで AI Translator を Windows にインストールして開く",
      description: "PowerShell にコマンドを 1 つ貼り付けると、AI Translator がダウンロード、確認され、あなたのアカウントだけにインストールされて開きます。",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator を Windows にインストール",
  lead: "Windows に AI Translator をインストールするいちばん早い方法は、PowerShell にコマンドを 1 つ貼り付けることです。インストーラーがダウンロード、確認され、あなたのアカウントだけに実行されて（管理者権限は不要）、SmartScreen の画面を通らずにアプリが開きます。すでにブラウザーで .exe をダウンロードしている場合は、ダブルクリックしてインストールすることもできますが、Windows 版はコード署名されていないため SmartScreen が警告することがあります。「詳細情報」を押してから「実行」を押してください。",
  meta: "<span>Windows 10・11、64 ビット（x64）向け</span> <span>更新日 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "このガイドの内容",
  body: `
<h2 id="requirements">お使いの PC で動きますか？</h2>
${facts([
  ["OS", "Windows 10 または 11、64 ビット（x64）<small>Windows ARM64 にはまだ対応していません。</small>"],
  ["プロセッサー", "AVX2 対応の CPU<small>AVX2 がない場合、アプリは理由を説明し、モデルをダウンロードしません。</small>"],
  ["メモリ", "最低 8 GB、16 GB 推奨<small>8 GB 未満の場合、アプリは理由を説明し、モデルをダウンロードしません。</small>"],
  ["グラフィックス", "Standard パックには、VRAM 6 GB 以上の独立グラフィックスカードを推奨<small>ない場合は CPU で動きます。</small>"],
  ["インストーラー", "約 22 MB の .exe ファイル 1 つ<small>あなたの Windows アカウントだけにインストールされ、管理者権限は不要です。</small>"],
  ["モデル用のディスク容量", "1.3 GB（Lite パック）または 2.5 GB（Standard パック）<small>ダウンロード中は、さらに 1 GB の空きが必要です。</small>"],
  ["インターネット", "モデルのダウンロードと Free お試しの登録に必要<small>インストール中にも必要な場合があります（下記参照）。その後、翻訳はオフラインで動きます。</small>"],
])}
<p class="small muted">Windows 11 でシステム音声の取り込みと字幕バーを試し、内蔵グラフィックスのノート PC 1 台で遅延の予備テストを行いました（Mac M4 Pro より遅い結果でした）。そのため、Windows での遅延はお約束していません。性能のある独立グラフィックスカードがない PC では、Lite パックを使ってください。</p>

<h2 id="install-command">かんたんな方法：コマンド 1 つでインストール</h2>
<ol>
<li><strong>PowerShell</strong> を開きます：<kbd>Windows</kbd> キーを押し、<strong>PowerShell</strong> と入力して Enter を押します。管理者として実行する必要はありません。</li>
<li>下のコマンドを貼り付けて Enter を押します。</li>
</ol>
${cmdBlock({ cmd: INSTALL_CMD, copy: "コマンドをコピー", copied: "コピーしました", label: "Windows に AI Translator をインストールするコマンド", term: "Windows PowerShell", prompt: "PS>" })}
<ol start="3">
<li>1 分ほど待ちます。コマンドが最新版をダウンロードし、SHA-256 を照合し、インストーラーを画面表示なしで実行して（<code>%LOCALAPPDATA%\\AI Translator\\</code> にインストール、UAC の確認なし）、アプリを開きます。</li>
<li>続きは<a href="/ja/guide/quick-start/">クイックスタートガイド</a>をご覧ください。</li>
</ol>
<p><strong>なぜ SmartScreen の画面が出ないのですか？</strong>SmartScreen が確認するのは、「インターネットからダウンロードした」という印（ブラウザーが付けます）が付いたファイルを、エクスプローラーから開いたときだけです。PowerShell でダウンロードしたファイルにはこの印がなく、インストーラーも PowerShell から実行されるため、このビルドがコード署名されていなくても警告は出ません。</p>
${callout({ kind: "warn", title: "このコマンドが何をするのかを理解しておいてください。", text: "コマンドは <strong>aitranslator.vn</strong> からスクリプトをダウンロードし、そのスクリプトが <strong>releases.aitranslator.vn</strong> からインストーラーをダウンロードして、SHA-256 を照合してからインストールします。管理者権限は不要で、データを送ることもありません。SHA-256 はファイルと同じ場所から配信されるので、おもに壊れたダウンロードを防ぐためのものです。<strong>aitranslator.vn</strong> を信頼していることに変わりはありません。先にスクリプトを読むには、表示してから実行するコマンドを使います：<code>$s = irm https://aitranslator.vn/install.ps1; $s | more; iex $s</code>。同じコマンドをいつでももう一度実行すれば更新できます。インストーラーは実行中のアプリを自分で閉じます。" })}
<p>うまくいきませんでしたか？スクリプトは止まって理由を表示します（対応していない PC、ネットワークがない、SHA-256 が一致しない…）。<a href="#common-problems">インストールでよくある問題</a>をご覧ください。</p>

<h2 id="install-exe">別の方法：.exe ファイルからインストール</h2>
<p>.exe をメールで受け取った場合や、PowerShell を使いたくない場合はこの方法を使います。ブラウザーでダウンロードしたファイルには「インターネットからダウンロードした」という印が付くため、SmartScreen が警告することがあります。</p>

<h3 id="verify-the-file">インストーラーを確認する（SHA-256）</h3>
${callout({ kind: "warn", title: "インストーラーは公式の入手先からだけダウンロードしてください。", text: "本物の .exe は、私たちが <strong>support@aitranslator.vn</strong> からお送りするもの、または <strong>aitranslator.vn</strong> にリンクがあるものです。それ以外の場所から入手したファイルは偽物や改ざんされたものの可能性があります。名前が AI Translator でも実行しないでください。" })}
<p>メールでお送りするインストーラーには、すべて SHA-256 チェックサムを添えています。Windows 版はコード署名されていないため、これを照合することがファイルが改ざんされていないことを確かめる方法になります。インストールする前に行ってください：</p>
<ol>
<li><strong>PowerShell</strong> を開きます：スタートを押し、<code>PowerShell</code> と入力して <strong>Windows PowerShell</strong> を開きます。</li>
<li>下のコマンドを入力し、<code>&lt;file-name&gt;</code> をダウンロードしたファイルの名前に置き換えてから Enter を押します。ファイル名にはスペースが含まれるので、例のようにパス全体をダブルクォーテーションで囲んでください。</li>
</ol>
<div class="table-wrap"><pre><code>Get-FileHash -Algorithm SHA256 "$env:USERPROFILE\\Downloads\\&lt;file-name&gt;.exe"</code></pre></div>
<ol start="3">
<li><strong>Hash</strong> 列の 64 文字の文字列を、私たちがお送りしたものと比べます。PowerShell は大文字で表示しますが、大文字か小文字かは関係ありません。ただし、すべての文字が一致している必要があります。</li>
<li>一致しない場合はファイルを実行しないでください。もう一度ダウンロードし、それでも一致しない場合は<a href="/ja/contact/">サポートにご連絡ください</a>。</li>
</ol>

<h3 id="run-the-installer">インストーラーを実行し、SmartScreen の警告を通過する</h3>
<p>インストーラーは <code>AI Translator_&lt;version&gt;_x64-setup.exe</code> のような名前のファイルです。AI Translator をあなたの Windows アカウントだけに <code>%LOCALAPPDATA%\\AI Translator\\</code> へインストールするので、管理者権限は不要で、管理者の確認（UAC）も表示されません。インストーラーは Windows の言語に応じて、ベトナム語か英語で表示されます。</p>
<p><strong>ダウンロード中にブラウザーが警告した場合。</strong>ブラウザーが、このファイルはあまりダウンロードされていないと表示することがあります。Microsoft Edge では、ダウンロードの一覧でファイルの横の「…」› <strong>保存</strong> › <strong>詳細表示</strong> › <strong>保持する</strong>を押します。Chrome では<strong>保存</strong>を押します。これは公式の入手先から入手したファイルにだけ行ってください。</p>
<ol>
<li>ダウンロードした <code>.exe</code> ファイル（通常はダウンロードフォルダーにあります）をダブルクリックします。</li>
<li>Windows に青い<strong>「Windows によって PC が保護されました」</strong>の画面（Microsoft Defender SmartScreen）が表示されたら、<strong>詳細情報</strong>を押します。</li>
<li><strong>アプリ</strong>の行を確認します：先ほど SHA-256 を確認したインストーラーのファイルである必要があります。<strong>発行元</strong>には<strong>不明な発行元</strong>と表示されますが、コード署名されていないビルドでは通常のことです。</li>
<li><strong>実行</strong>を押します。</li>
<li>インストーラーの案内に従って最後まで進みます。アプリに必要な Windows の表示用コンポーネントが PC にない場合、インストーラーがそれをダウンロードするので、この時点でインターネット接続が必要です（Windows 11 にはたいてい最初から入っています）。</li>
</ol>
<p>青い画面が表示されない場合は、そのまま通常どおりインストールしてください。Windows をほかの言語に設定している場合、ボタンの名前が異なることがあります。</p>
${callout({ kind: "warn", title: "なぜ Windows は警告するのですか？", text: "SmartScreen は、コード署名されていないファイルや、まだあまりダウンロードされていないファイルについて警告します。現在の Windows 版は、Windows のコード署名証明書をまだ持っていないため、コード署名されていません（macOS 版にまだ Apple Developer ID がないのと同じです）。ファイルが私たちから届いたもので SHA-256 が一致していれば、このビルドではこれが通常の流れです。証明書を取得すれば警告は徐々に減りますが、SmartScreen が新しいファイルの評判を築くには時間がかかるため、すぐに消えるとはお約束しません。" })}

<h2 id="smart-app-control">Windows 11 でアプリがブロックされ、先に進む方法が表示されない</h2>
<p>それは SmartScreen とは別の<strong>スマート アプリ コントロール</strong>です。ブロックモードでは、インストールの方法（コマンドか、ブラウザーでダウンロードした .exe か）にかかわらず、署名がなく評判もないアプリの実行を許可せず、<strong>実行</strong>ボタンもありません。この機能は、お使いの Windows 11 PC でオンになっている可能性があります（評価モードでは何もブロックせず、ブロックモードでだけブロックします）。</p>
<ol>
<li><strong>Windows セキュリティ › アプリとブラウザー コントロール › スマート アプリ コントロールの設定</strong>を開きます。</li>
<li><strong>オフ</strong>を選びます。</li>
<li>インストールのコマンドかインストーラーをもう一度実行します。</li>
</ol>
<p>古いバージョンの Windows 11 では、スマート アプリ コントロールを一度オフにすると、Windows を再インストールしない限りオンに戻せません。オフにしたくない場合は、私たちが Windows のコード署名証明書を取得するまでお待ちください。会社や学校が管理している PC では、オフにできないことがあります。管理者にお問い合わせください。</p>

<h2 id="first-launch">初回起動</h2>
<ol>
<li>スタートメニューから <strong>AI Translator</strong> を開きます。</li>
<li>アプリに初期設定が表示されます。Windows には音声の許可の手順はありません。アプリは別の許可なしで PC で再生されている音を取り込みます。マイクを含む入力元を選ぶ場合は、Windows でアプリのマイク使用を許可してください（設定 › プライバシーとセキュリティ › マイク）。</li>
<li>続きは<a href="/ja/guide/quick-start/">クイックスタートガイド</a>をご覧ください。</li>
</ol>
<p>AI Translator はシステムトレイに常駐します。ウィンドウを閉じてもアプリは隠れるだけで、完全に終了するにはトレイのアイコンから<strong>終了</strong>を選びます。Windows は新しいアイコンをタスクバーの <strong>^</strong> 矢印の中に隠すことがあります。アイコンをタスクバーにドラッグするか、タスクバーの設定でオンにしてください。Windows のショートカットは Ctrl+Alt を使います（<a href="/ja/guide/subtitle-bar-and-shortcuts/">字幕バーとショートカット</a>をご覧ください）。</p>

<h2 id="updates">更新</h2>
<p>アプリは開いてから 1 分ほどで新しいバージョンを確認し、その後は 24 時間ごとに確認して、バックグラウンドでダウンロードします。準備ができると「再起動」か「後で」を尋ね（トレイのメニューにも「再起動して更新」があります）、再起動するか「終了」を選んだときに新しいバージョンがインストールされます。アップデートチャンネル（安定版または Beta）は「設定 › 一般」で選び、変更するとすぐに確認します。すぐに確認するには、「設定 › 一般」の<strong>アップデートを確認</strong>を押すか、アプリのアイコンのメニューから「アップデートを確認…」を選びます。同じインストールのコマンドをいつでも実行して、最新版を入手することもできます。メールでお送りした .exe からインストールし、そのビルドが自動で更新されない場合は、新しいものを SHA-256 とともにお送りします。新しいファイルでも SmartScreen が警告することがあります。</p>

<h2 id="uninstall">正しくアンインストールする</h2>
<ol>
<li>AI Translator を開き、<strong>設定 › プライバシー</strong>に移動します。</li>
<li><strong>モデルとデータを削除</strong>を押し、<strong>すべて削除</strong>で確定します。アプリはダウンロードしたモデル（1.3 GB または 2.5 GB）、履歴、用語集をすべて削除します。</li>
<li>システムトレイの AI Translator のアイコンから<strong>終了</strong>を選びます。</li>
<li><strong>設定 › アプリ › インストールされているアプリ</strong>を開き、<strong>AI Translator</strong> を探して<strong>アンインストール</strong>を押します。</li>
</ol>
<p>アンインストーラーにはアプリのデータを削除するオプションがあり、チェックを入れると、手順 1〜2 を飛ばしていてもモデルが削除されます。ライセンスと残りの翻訳時間は残るので、もう一度インストールしても購入したプランは失われないはずです。Free お試しは PC に結び付いているため、もう一度インストールしても 10 日間は元に戻りません。モデル、履歴、用語集、ログは <code>%LOCALAPPDATA%\\com.aitranslator.desktop\\</code> にあり（モデルは <code>models</code> サブフォルダー、ログは <code>logs\\app.log</code>）、設定ファイル <code>settings.json</code> は <code>%APPDATA%\\com.aitranslator.desktop\\</code> にあります。キー、トークン、翻訳時間のカウンターは資格情報マネージャーに保管されます。</p>

<h2 id="common-problems">インストールでよくある問題</h2>
<ul>
<li><strong>インストールのコマンドが https://releases.aitranslator.vn/stable/latest.json を読み取れないと表示する。</strong>PC がネットワークにつながっていないか、プロキシや VPN が <code>releases.aitranslator.vn</code> をブロックしています。接続を確認して、もう一度実行してください。</li>
<li><strong>インストールのコマンドが SHA-256 が一致しないと表示する。</strong>ダウンロードが途中で壊れたか、改ざんされました。スクリプトは何もインストールしません。もう一度実行し、それでも一致しない場合は<a href="/ja/contact/">サポート</a>にご連絡ください。</li>
<li><strong>インストールのコマンドが実行できない（制約付き言語モードと表示される）。</strong>会社が管理している PC では、スクリプトがブロックされることがあります。.exe での方法を使うか、管理者にお問い合わせください。</li>
<li><strong>アプリがブロックされ、先に進む方法がない。</strong>上のスマート アプリ コントロールの節をご覧ください。</li>
<li><strong>SmartScreen に「実行」ボタンがない。</strong>（ブラウザーでダウンロードした .exe からインストールした場合のみ。）PC のポリシー（たとえば会社や学校が管理するコンピューター）が、コード署名されていないアプリをブロックしている可能性があります。コンピューターの管理者にお問い合わせください。</li>
<li><strong>ウイルス対策ソフトがインストーラーをブロックまたは削除する。</strong>SHA-256 をもう一度確認してください。一致しているのにブロックされる場合は、お使いのウイルス対策ソフトの名前を添えて<a href="/ja/contact/">サポートにご連絡ください</a>。</li>
<li><strong>アプリに「このコンピューターのプロセッサーには、AI Translator に必要な AVX2 がありません。」と表示される。</strong>AVX2 がないと、アプリはモデルをダウンロードできません。</li>
<li><strong>アプリに「このコンピューターの RAM は 8 GB 未満で、AI Translator はまだ対応していません。」と表示される。</strong>8 GB 未満の PC ではモデルをダウンロードできません。</li>
<li><strong>Windows ARM64 の PC。</strong>まだ対応していません。Windows 版は x64 のみで、ARM64 のマシンではテストしていません。</li>
<li><strong>アプリに「この AI Translator は正規品ではないため、Free のみ使用できます。」と表示される。</strong>インストールしたものが改変されているか、正しくない入手先から来ています。公式の入手先からもう一度ダウンロードしてください。</li>
</ul>
<p>インストールしたあとに字幕が表示されない場合は、<a href="/ja/guide/troubleshooting/">トラブルシューティング</a>をご覧ください。</p>

${docNav(
  [
    { href: "/ja/guide/quick-start/", kicker: "前へ", title: "AI Translator クイックスタート" },
    { href: "/ja/guide/subtitle-bar-and-shortcuts/", kicker: "次へ", title: "字幕バーとショートカット" },
    { href: "/ja/guide/troubleshooting/", kicker: "関連", title: "トラブルシューティング" },
  ],
  "関連するガイド",
)}
`,
})}
</div></section>
`,
};
