import { RELEASE } from "../../site.mjs";
import { pageHero, sectionHead, steps, callout, facts, ctaBand, feature, icon, faq, cmdBlock, chips, flow, osTabs } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ダウンロード", path: "/ja/download/" },
];

const mailto = (subject, body) =>
  `mailto:support@aitranslator.io.vn?subject=${encodeURIComponent(subject)}&amp;body=${encodeURIComponent(body.join("\n"))}`;

// サポートは英語またはベトナム語で返信するため、項目名には英語を併記します。
const MAILTO_MAC = mailto("AI Translator installer request (macOS)", [
  "AI Translator チーム御中 (Hello AI Translator team),",
  "",
  "macOS 用のインストーラー（.dmg）をお送りください。(I would like to receive the macOS installer.)",
  "",
  "- 氏名 (Full name):",
  "- Mac のモデルとチップ（例：MacBook Air M2）(Mac model and chip):",
  "- macOS のバージョン (macOS version):",
  "- RAM:",
  "- 使う予定のアプリ（Zoom、Teams、Meet、Zalo、ウェビナーなど）(I plan to use it with):",
  "- 翻訳したい言語（英語、中国語、日本語、韓国語、ベトナム語）(Languages I need translated):",
  "",
  "よろしくお願いいたします。(Thank you!)",
]);

const MAILTO_WIN = mailto("AI Translator installer request (Windows)", [
  "AI Translator チーム御中 (Hello AI Translator team),",
  "",
  "Windows 用のインストーラー（.exe）をお送りください。(I would like to receive the Windows installer.)",
  "",
  "- 氏名 (Full name):",
  "- PC のモデルとプロセッサー（例：Dell のノートパソコン、Intel Core i5-1235U）(PC model and processor):",
  "- Windows のバージョン（10 または 11）(Windows version):",
  "- RAM:",
  "- グラフィックスカード（ある場合）(Graphics card):",
  "- 使う予定のアプリ（Zoom、Teams、Meet、Zalo、ウェビナーなど）(I plan to use it with):",
  "- 翻訳したい言語（英語、中国語、日本語、韓国語、ベトナム語）(Languages I need translated):",
  "",
  "よろしくお願いいたします。(Thank you!)",
]);

const INSTALL_CMD = "curl -fsSL https://aitranslator.io.vn/install.sh | bash";
const INSTALL_CMD_BETA = "curl -fsSL https://aitranslator.io.vn/install.sh | bash -s -- --beta";
const INSTALL_CMD_REVIEW = "curl -fsSL https://aitranslator.io.vn/install.sh -o install.sh && less install.sh && bash install.sh";
const WIN_CMD = "irm https://aitranslator.io.vn/install.ps1 | iex";
const WIN_CMD_BETA = "& ([scriptblock]::Create((irm https://aitranslator.io.vn/install.ps1))) -Beta";
const WIN_CMD_REVIEW = "$s = irm https://aitranslator.io.vn/install.ps1; $s | more; iex $s";

const COPY = { copy: "コピー", copied: "コピーしました" };

const DL_FAQ = [
  {
    q: "1 行のコマンドは何をするのですか？安全ですか？",
    a: `<p>コマンドは <strong>aitranslator.io.vn</strong> から小さなスクリプトをダウンロードします。スクリプトはパソコンを確認し、最新のバージョン番号を読み取り、<strong>releases.aitranslator.io.vn</strong> からインストーラーとその SHA-256 チェックサムをダウンロードし、チェックサムを照合してからアプリをインストールして開きます。データを送信することはなく、管理者権限も必要ありません。</p><p>インターネットから貼り付けたコマンドを実行するということは、常にその提供元を信頼するということです。実行する前にスクリプトを読みたい場合は、お使いの OS のガイドにある「先にスクリプトを読みたい」を開いてください。SHA-256 チェックサムはファイルと同じ場所から配信されるため、主に壊れたダウンロードから守るためのもので、提供元を信頼することの代わりにはなりません。</p>`,
  },
  {
    q: "なぜ .dmg や .exe のダウンロードボタンがないのですか？",
    a: `<p>現在のビルドはまだ Apple や Microsoft の署名を受けていません（Apple Developer ID も Windows のコード署名証明書もまだ持っていません）。ブラウザーでダウンロードしたファイルには「インターネットからダウンロード」の印が付くため、macOS は .dmg の初回起動をブロックし（このまま開く）、Windows の SmartScreen は .exe について警告することがあります。ターミナルや PowerShell のコマンドでダウンロードしたファイルにはこの印が付かないため、アプリはそのままインストールされて開きます。証明書を取得したら、直接ダウンロードできるボタンを追加します。</p>`,
  },
  {
    q: "更新やアンインストールはどうすればいいですか？",
    a: `<p>アプリは自分で新しいバージョンを確認します（設定 › 一般）。同じインストールコマンドをいつでも実行して最新版をインストールすることもできます。スクリプトは実行中のアプリを終了して古いものを置き換えます。アンインストールするときは、まずアプリの中でモデルとデータを削除してからアプリを削除してください。<a href="/ja/guide/install-macos/#uninstall">macOS</a> と <a href="/ja/guide/install-windows/#uninstall">Windows</a> のアンインストールガイドをご覧ください。</p>`,
  },
  {
    q: "Intel チップの Mac で使えますか？",
    a: `<p>まだ使えません。AI Translator には Apple シリコン（M1 以降）の Mac と macOS 14.2 以降が必要です。Mac が条件を満たしていない場合、インストールコマンドは止まって理由を表示します。</p>`,
  },
  {
    q: "どの Windows パソコンで動きますか？",
    a: `<p>Windows 10 または 11 の 64 ビット（x64）で、AVX2 に対応した CPU と 8 GB 以上の RAM が必要です。Windows ARM64 にはまだ対応していません。AVX2 がない場合や RAM が 8 GB 未満の場合、アプリは理由を説明し、モデルをダウンロードできないようにします。Windows での遅延は内蔵グラフィックスのノートパソコン 1 台で予備テストをしただけで、Mac M4 Pro より遅いため、お約束はできません。</p>`,
  },
  {
    q: "アプリは自動で更新されますか？",
    a: `<p>「設定 › 一般 › アップデートチャンネル」に、安定版と Beta の 2 つのアップデートチャンネルがあります。アプリは起動時と 24 時間ごとに確認し、チャンネルを変えるとすぐに確認します。今すぐ確認するには、「設定 › 一般」の上部にあるブロックで「バージョン …」の横の<strong>アップデートを確認</strong>をクリックするか（確認のたびに「HH:MM:SS に確認しました」と表示されます）、アプリのアイコンのメニューから「アップデートを確認…」を選んでください。macOS では更新のたびにキーチェーンの承認を 1 回求められます。Windows では追加で何かを求められることはありません。</p>`,
  },
];

const macPanel = () => `
${chips([["command", "macOS 14.2 以降"], ["cpu", "Apple シリコン（M1 以降）"], ["download", "インストーラー約 9 MB"], ["shield", "管理者パスワード不要"]])}
${flow([
  { title: "ターミナルを開く", text: "<p><span class='nowrap'><kbd>⌘</kbd> + <kbd>Space</kbd></span> を押し、<strong>ターミナル</strong>と入力して Enter を押します。</p>" },
  {
    title: "このコマンドを貼り付けて Enter を押す",
    text: `<p><strong>コピー</strong>をクリックし、<span class='nowrap'><kbd>⌘</kbd> + <kbd>V</kbd></span> でターミナルに貼り付けます。</p>${cmdBlock({ cmd: INSTALL_CMD, ...COPY, label: "macOS に AI Translator をインストールするコマンド", term: "Terminal" })}<p class="small">パスワードは不要です。同じコマンドをいつでも実行すれば最新版に更新できます。</p>`,
  },
  { title: "アプリが開くまで待つ", text: "<p>1 分ほどかかります。コマンドが最新版をダウンロードし、SHA-256 を確認して、AI Translator をアプリケーションにコピーして開きます。初めて<strong>開始</strong>をクリックすると、macOS がシステムオーディオの録音の許可を求めるので、「許可」を選んでください。</p>" },
])}
<div class="panel-more">
<h3>オプションとトラブルシューティング</h3>
${faq(
  [
    {
      q: "なぜ「このまま開く」の手順がないのですか？",
      a: "<p>macOS 版はまだ Apple の公証（notarize）を受けていないため（Apple Developer ID をまだ持っていません）、ブラウザーでダウンロードした .dmg は初回起動時に macOS にブロックされます。ターミナルのコマンドでダウンロードしたファイルには macOS が「インターネットからダウンロード」の印を付けないため、アプリはそのまま開きます。その代わり、コマンドの提供元を信頼する必要があります。下の質問をご覧ください。</p>",
    },
    {
      q: "先にスクリプトを読みたい",
      a: `<p>スクリプトは <a href="/install.sh">aitranslator.io.vn/install.sh</a> にあります（約 200 行、コメント付き）。次のコマンドはスクリプトをダウンロードして読めるようにし、そのあとで実行します：</p>${cmdBlock({ cmd: INSTALL_CMD_REVIEW, ...COPY, label: "実行前に確認できるようにスクリプトをダウンロードするコマンド", term: "Terminal" })}`,
    },
    {
      q: "新しいビルドを早めに試す（Beta チャンネル）",
      a: `<p>初期設定では、コマンドは安定版をインストールします。新しいビルドがあるときに早めに試すには（Beta チャンネル）、<code>bash</code> のあとに <code>-s -- --beta</code> を付けます：</p>${cmdBlock({ cmd: INSTALL_CMD_BETA, ...COPY, label: "Beta チャンネルからインストールするコマンド", term: "Terminal" })}`,
    },
    {
      q: "ブラウザーで .dmg をダウンロードしたら macOS にブロックされた",
      a: "<p>いちばん早いのは、上のインストールコマンドを実行することです。最新版が上書きでインストールされ、アプリはそのまま開きます。手動で許可することもできます：<strong>システム設定 › プライバシーとセキュリティ</strong>を開いて下までスクロールし、AI Translator の横の<strong>このまま開く</strong>をクリックして、パスワードか Touch ID で確認します。<a href=\"/ja/guide/install-macos/\">macOS のインストールガイド</a>をご覧ください。</p>",
    },
    {
      q: "更新のたびに macOS は何を求めますか？",
      a: "<p>アドホック署名のビルドはリリースのたびに署名が変わるため、macOS がキーチェーンへのアクセスをもう一度求めます：Mac のログインパスワードを求める<strong>ダイアログが 1 つ</strong>出るので、<strong>常に許可</strong>を選んでください。システムオーディオの録音の許可をもう一度 1 回求められることもあります。初めてインストールする方にはキーチェーンのダイアログは出ません。0.1.0 から 0.1.1 への最初の更新だけは、1 度だけ 5 回求められます。</p>",
    },
    {
      q: ".dmg をメールで受け取りたい",
      a: `<p><a href="${MAILTO_MAC}">support@aitranslator.io.vn</a> に短いメールをお送りください。.dmg とその SHA-256 チェックサムを返信でお送りします。ブラウザーでダウンロードした .dmg は、初回起動時に「このまま開く」の手順が必要です。</p>`,
    },
  ],
  { open: false },
)}
</div>
<div class="panel-foot"><p>アンインストールも含めて、手順を一つずつ確認したいですか？</p><a class="btn btn-secondary btn-sm" href="/ja/guide/install-macos/">macOS の詳しいガイド ${icon("arrow-right")}</a></div>
`;

const winPanel = () => `
${chips([["windows", "Windows 10 または 11、64 ビット"], ["cpu", "AVX2 対応の CPU"], ["download", "インストーラー約 22 MB"], ["shield", "管理者権限不要"]])}
${flow([
  { title: "PowerShell を開く", text: "<p><kbd>Windows</kbd> キーを押し、<strong>PowerShell</strong> と入力して Enter を押します。管理者として実行する必要はありません。</p>" },
  {
    title: "このコマンドを貼り付けて Enter を押す",
    text: `<p><strong>コピー</strong>をクリックし、PowerShell に貼り付けます（右クリック、または <span class='nowrap'><kbd>Ctrl</kbd> + <kbd>V</kbd></span>）。</p>${cmdBlock({ cmd: WIN_CMD, ...COPY, label: "Windows に AI Translator をインストールするコマンド", term: "Windows PowerShell", prompt: "PS>" })}<p class="small">同じコマンドをいつでも実行すれば最新版に更新できます（インストーラーが実行中のアプリを閉じて古いものを置き換えます）。</p>`,
  },
  { title: "アプリが開くまで待つ", text: "<p>1 分ほどかかります。コマンドが最新版をダウンロードし、SHA-256 を確認して、あなたのアカウントだけにインストーラーをサイレントで実行し、AI Translator を開きます。Windows では録音の許可は求められません。アプリはモデルを一度ダウンロードすれば、翻訳の準備が整います。</p>" },
])}
<div class="panel-more">
<h3>オプションとトラブルシューティング</h3>
${faq(
  [
    {
      q: "なぜ SmartScreen の警告が出ないのですか？",
      a: "<p>Windows 版はまだコード署名されていません（Windows のコード署名証明書をまだ購入していません）。SmartScreen が確認するのは「インターネットからダウンロード」の印が付いたファイルだけで、この印はブラウザーでファイルをダウンロードしたときに付きます。PowerShell でダウンロードしたファイルにはこの印がないため、インストーラーはそのまま実行されます。それでもコマンドの提供元を信頼する必要はあります。下の質問をご覧ください。</p>",
    },
    {
      q: "先にスクリプトを読みたい",
      a: `<p>スクリプトは <a href="/install.ps1">aitranslator.io.vn/install.ps1</a> にあります（コメント付き）。次のコマンドはスクリプトを表示して読めるようにし、そのあとで実行します：</p>${cmdBlock({ cmd: WIN_CMD_REVIEW, ...COPY, label: "実行前に確認できるようにスクリプトを表示するコマンド", term: "Windows PowerShell", prompt: "PS>" })}`,
    },
    {
      q: "新しいビルドを早めに試す（Beta チャンネル）",
      a: `<p>初期設定では、コマンドは安定版をインストールします。新しいビルドがあるときに早めに試すには（Beta チャンネル）、次のコマンドを使います：</p>${cmdBlock({ cmd: WIN_CMD_BETA, ...COPY, label: "Windows で Beta チャンネルからインストールするコマンド", term: "Windows PowerShell", prompt: "PS>" })}`,
    },
    {
      q: "Windows 11 でアプリがブロックされ、先に進む方法がない",
      a: "<p>それは<strong>スマート アプリ コントロール</strong>です。ブロックモードでは、署名がなく評価のないアプリは、どうインストールしても実行できません。オフにすることもできます：<strong>Windows セキュリティ › アプリとブラウザー コントロール › スマート アプリ コントロールの設定</strong>を開いて<strong>オフ</strong>を選び、インストールコマンドをもう一度実行してください。Windows のコード署名証明書を取得すれば、この問題はなくなります。<a href=\"/ja/guide/install-windows/#smart-app-control\">詳細</a>。</p>",
    },
    {
      q: "ブラウザーで .exe をダウンロードしたら SmartScreen に警告された",
      a: "<p>青い「Windows によって PC が保護されました」の画面は、署名のないビルドでは普通に表示されます。ファイルが私たちから届いたもので SHA-256 が一致していれば、<strong>詳細情報</strong>をクリックし、アプリの行にインストーラーのファイル名が表示されていることを確認してから、<strong>実行</strong>をクリックします。または上のインストールコマンドを実行してください。SmartScreen を通さずに最新版がインストールされます。<a href=\"/ja/guide/install-windows/\">手順のガイドをご覧ください</a>。</p>",
    },
    {
      q: "会社や学校のパソコンでコマンドが失敗する",
      a: "<p>管理されたパソコンでは PowerShell のスクリプトがブロックされることがあります（制約付き言語モード）。.exe を使うか（メールでお送りできます）、管理者にご相談ください。</p>",
    },
    {
      q: ".exe をメールで受け取りたい",
      a: `<p><a href="${MAILTO_WIN}">support@aitranslator.io.vn</a> に短いメールをお送りください。.exe とその SHA-256 チェックサムを返信でお送りします。ブラウザーでダウンロードした .exe は SmartScreen の警告が出ることがあります。</p>`,
    },
  ],
  { open: false },
)}
</div>
<div class="panel-foot"><p>アンインストールも含めて、手順を一つずつ確認したいですか？</p><a class="btn btn-secondary btn-sm" href="/ja/guide/install-windows/">Windows の詳しいガイド ${icon("arrow-right")}</a></div>
`;

export default {
  id: "download",
  lang: "ja",
  path: "/ja/download/",
  title: "macOS・Windows 版をダウンロード",
  description:
    "macOS 14.2 以降（Apple シリコン）や Windows 10/11 にコマンド 1 行でインストール。すぐに開き、「このまま開く」も不要です。10 日間の無料お試し付き。",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: f.a })))],
  body: () => `
${pageHero({
  crumbs,
  title: "macOS 版と Windows 版の AI Translator を入手",
  lead: "OS を選んで、ターミナルか PowerShell にコマンドを 1 行貼り付けるだけです。アプリがダウンロードされ、確認され、すぐに開きます。10 日間の無料お試し、カードは不要です。",
  meta: '<span id="os-detect" class="os-detect" hidden></span>',
})}

<section class="section-tight" id="install"><div class="container dl">
${osTabs({
  labels: {
    list: "OS を選択",
    mine: "お使いのパソコン",
    detected: "{os} をお使いのようです",
    mobile: "スマートフォンかタブレットでご覧になっています。AI Translator は macOS か Windows のパソコンで動きます。パソコンでこのページを開いてください。",
    other: "AI Translator は現在 macOS と Windows のみに対応しており、このパソコンの OS には対応していません。下の 2 つのガイドを読むことはできます。",
    copyLink: "ページのリンクをコピー",
    copied: "コピーしました",
  },
  tabs: [
    { key: "macos", id: "install-macos", icon: "command", title: "macOS", sub: "Apple シリコン · 14.2 以降", body: macPanel() },
    { key: "windows", id: "install-windows", icon: "windows", title: "Windows", sub: "10 / 11 · 64 ビット", body: winPanel() },
  ],
})}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "概要", title: "無料お試しと料金", center: true })}
<div class="reveal">${facts([
  ["現在のバージョン", RELEASE.ja],
  ["状態", "リリース済み。macOS も Windows もコマンド 1 行でインストール"],
  ["無料お試し", "10 日間、1 日 30 分<small>カードもアカウントも不要</small>"],
  ["その後の料金", "Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>VietQR（VND）または国際カード（USD）で前払い、自動更新なし。Creem の一覧にある一部の国ではカードを利用できません。</small>"],
  ["モデル", "1.3 GB または 2.5 GB を一度だけダウンロード<small>そのあとは、認識と翻訳がパソコン上でオフラインで動きます</small>"],
])}</div>
${callout({ kind: "ok", title: "インストーラーは私たちからだけ入手してください", text: "AI Translator は、このページのコマンドか、<strong>support@aitranslator.io.vn</strong> から送られたリンク、またはウェブサイト <strong>aitranslator.io.vn</strong> からだけインストールしてください。ほかの入手元のインストーラーは偽物の可能性があります。" })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "動作環境", title: "お使いのパソコンで動きますか？", center: true })}
<div class="table-wrap reveal" role="region" aria-label="動作環境" tabindex="0"><table>
<thead><tr><th scope="col"><span class="sr-only">項目</span></th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">OS</th><td>macOS 14.2 以降</td><td>Windows 10 または 11、64 ビット（x64）</td></tr>
<tr><th scope="row">プロセッサー</th><td>Apple シリコン（M1 以降）。Intel Mac 版はありません</td><td>AVX2 対応の CPU。Windows ARM64 にはまだ対応していません</td></tr>
<tr><th scope="row">RAM</th><td>8 GB 以上、16 GB 推奨</td><td>8 GB 以上、16 GB 推奨</td></tr>
<tr><th scope="row">グラフィックス</th><td>Apple GPU</td><td>Standard パックには VRAM 6 GB 以上のディスクリート GPU を推奨。ない場合は CPU で動きます</td></tr>
<tr><th scope="row">ディスクの空き容量</th><td>1.3 GB（Lite パック）または 2.5 GB（Standard パック）、ダウンロード中はさらに 1 GB</td><td>同じ</td></tr>
<tr><th scope="row">インストーラー</th><td>約 9 MB の .dmg ファイル（インストールコマンドが自動でダウンロード）</td><td>約 22 MB の .exe ファイル。管理者権限なしで、あなたのアカウントだけにインストール</td></tr>
<tr><th scope="row">コード署名</th><td>アドホック署名、公証なし：コマンドでインストールすれば直接開きます。ブラウザーでダウンロードした .dmg は初回起動時に「このまま開く」が必要</td><td>コード署名なし：コマンドでインストールすれば SmartScreen の確認は出ません。ブラウザーでダウンロードした .exe は警告が出ることがあり、ブロックモードのスマート アプリ コントロールではブロックされます</td></tr>
<tr><th scope="row">許可</th><td>システムオーディオの録音（マイクは使いません）</td><td>録音の許可は不要</td></tr>
</tbody></table></div>
<p class="small muted">RAM が 8 GB 未満のパソコンや、AVX2 に対応していないプロセッサーでは、アプリが理由を説明し、モデルをダウンロードできないようにします。Intel Mac 版はありません。</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "よくある質問", title: "インストールについて" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "次の会議で試してみませんか？", text: "Mac でも Windows でもコマンド 1 行。10 日間の無料お試し、カードは不要です。", primary: { href: "#install", label: "OS を選んでインストール" }, secondary: { href: "/ja/guide/quick-start/", label: "クイックスタートガイドを読む" } })}
`,
};
void feature;
void steps;
