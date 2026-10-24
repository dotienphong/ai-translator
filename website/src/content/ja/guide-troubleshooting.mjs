import { pageHero, faq, keys, appShot, docLayout, docNav } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ガイド", path: "/ja/guide/" },
  { name: "トラブルシューティング", path: "/ja/guide/troubleshooting/" },
];

const toc = [
  { level: 2, id: "no-audio", text: "字幕が出ない、音声が聞こえない" },
  { level: 2, id: "slow-or-stopped", text: "字幕が遅れる、抜ける、止まる" },
  { level: 2, id: "models-macos", text: "モデル、インストール、macOS と Windows" },
  { level: 2, id: "license-quota", text: "ライセンス、翻訳時間、お試し" },
  { level: 2, id: "type-and-translate", text: "入力翻訳" },
  { level: 2, id: "send-logs", text: "ログを送って問題を報告する" },
  { level: 2, id: "quick-answers", text: "すぐわかる回答" },
];

const QUICK = [
  {
    q: "ウィンドウを閉じてもアプリが動き続けます。どうすれば終了できますか？",
    a: "<p>ウィンドウを閉じても、アプリはメニューバー（macOS）またはシステムトレイ（Windows）に隠れるだけです。メニューバーかトレイの AI Translator のアイコンから<strong>終了</strong>を選んでください。Mac では ⌘Q では終了しません。</p>",
  },
  {
    q: "アプリを再インストールすると、キーがなくなったり 10 日間のお試しがやり直しになったりしますか？",
    a: "<p>いいえ。同じパソコンへの再インストールは新しいパソコンとは数えられず、10 日間のお試しはパソコンごとに記録されるため、やり直しはできません。</p>",
  },
  {
    q: "ログから会議で話された内容がわかりますか？",
    a: "<p>いいえ。ログには音声も文字起こしのテキストも含まれません。アプリでエラーが起きると、個人フォルダーのパス、キー、トークン、メールアドレスを取り除いたうえで、ログの関係する部分を私たちに送ります。これは「設定 › プライバシー」でオフにできます。</p>",
  },
];

export default {
  id: "guide-troubleshooting",
  lang: "ja",
  path: "/ja/guide/troubleshooting/",
  title: "トラブルシューティング：よくあるエラーと直し方",
  description:
    "AI Translator の症状、原因、直し方：字幕が出ない、音声が聞こえない、モデルのダウンロードのエラー、ロックされたキー、使い切った翻訳時間。サポートへのログの送り方。",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-24",
  schema: [faqPage(QUICK.map((f) => ({ q: f.q, a: f.a })))],
  body: () => `
${pageHero({
  crumbs,
  title: "トラブルシューティング",
  lead: "AI Translator の問題のほとんどは、録音の許可、音声ソース、モデル、ライセンスの 4 つに分けられます。下の表でアプリに表示されたとおりのメッセージを探し、直し方に従ってください。それでも解決しない場合は、ログをサポートに送ってください。",
  meta: `<span>更新日 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "このページの内容",
  body: `
<h2 id="no-audio">字幕が出ない、または音声が聞こえない</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">「アプリから音が出ているのに何も聞こえません。AI Translator にシステムオーディオの録音が許可されていない可能性があります。」</span><p><strong>原因：</strong>macOS が許可を与えておらず、エラーも出しません。アプリには無音だけが届きます。</p><p><strong>直し方：</strong><strong>システム設定を開く</strong>を押し、「プライバシーとセキュリティ › 画面とシステムオーディオの録音 › システムオーディオの録音のみ」で AI Translator をオンにしてから、もう一度<strong>開始</strong>を押します。<a href="/ja/guide/macos-audio-permission/">音声の許可のガイド</a>をご覧ください。Windows にはこの許可はありません。何も聞こえない場合は、「設定 › 音声」で選ばれている再生デバイスを確認してください。</p></div>
<div class="card"><span class="card-title">「音声が聞こえません。会議の音声が再生されているか確認してください。」または「音声を取得できませんでした。」</span><p><strong>原因：</strong>何も再生されていない、音声ソースが違う、またはアプリが音声ソースを開けませんでした。</p><p><strong>直し方：</strong>会議の音声をオンにします。「設定 › 音声」で<strong>リストを更新</strong>を押し、音声ソースを選び直して、もう一度<strong>開始</strong>を押します。続く場合はログを送ってください。</p></div>
<div class="card"><span class="card-title">「選択したアプリから音が出ていません」</span><p><strong>原因：</strong><strong>{アプリ名} のみ</strong>を選んでいて、そのアプリが無音です。</p><p><strong>直し方：</strong>そのアプリから音を出す（翻訳はすぐに再開します）か、<strong>システム全体（このアプリを除く）</strong>を選びます（次のセッションから）。</p></div>
<div class="card"><span class="card-title">字幕バーが見えない</span><p><strong>原因：</strong>アプリを開いたとき、「開始」を押すまでバーは隠れています。または、ショートカットや ✕ ボタンでバーを隠しました（✕ ボタンは翻訳も停止します）。</p><p><strong>直し方：</strong>✕ を押した場合は、<strong>開始</strong>を押してもう一度翻訳するとバーが戻ります。そうでなければ、ホーム画面の<strong>字幕バー</strong>で<strong>表示</strong>を押すか、${keys(["⌃", "⌥", "H"])}（Windows：${keys(["Ctrl", "Alt", "H"])}）を押すか、メニューバーやトレイのメニューで「字幕を表示」を選びます。ロックされている場合は、${keys(["⌃", "⌥", "L"])}（Windows：${keys(["Ctrl", "Alt", "L"])}）でロックを解除します。</p></div>
<div class="card"><span class="card-title">「登録できなかったショートカットがあります。設定 › ショートカット で変更してください。」</span><p><strong>原因：</strong>ほかのアプリがそのキーの組み合わせをすでに使っています。</p><p><strong>直し方：</strong>「設定 › ショートカット」で<strong>変更</strong>を押し、Ctrl、Alt、Cmd/Win のうち少なくとも 1 つを含む新しい組み合わせを押します（Shift だけでは足りません）。</p></div>
<div class="card"><span class="card-title">「マイクの信号なし」</span><p><strong>原因：</strong>マイクを含む入力元のときだけ起こります。マイクがミュートされている（マイクのミュートキー、ヘッドセットのボタン）か、macOS がアプリのマイク使用を許可していません。その場合 macOS はエラーを出さず、無音だけを渡します。</p><p><strong>直し方：</strong>マイクのミュートを解除します。それでも直らなければ<strong>マイクの設定を開く</strong>を押して AI Translator をオンにし、macOS に聞かれたら<strong>終了して再度開く</strong>を選びます。</p></div>
<div class="card"><span class="card-title">「マイクが許可されていません」</span><p><strong>原因：</strong>マイクの許可を拒否しました。入力元が「マイク」ならセッションは始まりません。「コンピューターの音声 + マイク」なら、アプリはコンピューターの音声だけを翻訳します。</p><p><strong>直し方：</strong><strong>マイクの設定を開く</strong>を押して AI Translator をオンにします（macOS：システム設定 › プライバシーとセキュリティ › マイク。Windows：設定 › プライバシーとセキュリティ › マイクで、<em>デスクトップ アプリがマイクにアクセスできるようにする</em>もオン）。macOS では、聞かれたら<strong>終了して再度開く</strong>を選びます。<a href="/ja/guide/macos-audio-permission/#microphone-permission">マイクの許可</a>をご覧ください。</p></div>
<div class="card"><span class="card-title">「マイクを開けません」</span><p><strong>原因：</strong>選んだマイクが抜かれた、見つからない、またはほかのアプリが独占しています。</p><p><strong>直し方：</strong>マイクを挿し直すか、設定 › 音声で<strong>リストを更新</strong>を押して別のマイクを選びます。「コンピューターの音声 + マイク」では、アプリはコンピューターの音声の翻訳を続け、2 秒ごとにマイクを開き直します。</p></div>
<div class="card"><span class="card-title">Bluetooth ヘッドセットのマイクを使うと音が悪くなる</span><p><strong>原因：</strong>Bluetooth ヘッドセットのマイクを使うと、ヘッドセットが通話モードに切り替わり、音質が下がります。</p><p><strong>直し方：</strong>設定 › 音声 › マイクで、パソコンのマイクか外付けマイクを選びます。聞くのはヘッドセットのままで構いません。</p></div>
</div>

<h2 id="slow-or-stopped">字幕が遅れる、抜ける、止まる</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">「処理が追いついていません」、「CPU で実行中（速度が遅くなります）。」、「このコンピューターはメモリが不足しました。Lite モデルパックをおすすめします。」</span><p><strong>原因：</strong>パソコンが発話に追いつけない、または GPU でエラーが起きてアプリが CPU に切り替えました。</p><p><strong>直し方：</strong>重いアプリを閉じます。「設定 › モデル」で Lite パックを選び、<strong>このパックを使用</strong>を押します（まだダウンロードしていない場合は<strong>ダウンロードして使用</strong>を押します）。新しいパックは次のセッションから使われます。</p></div>
<div class="card"><span class="card-title">「翻訳を利用できません：原文のみ」、「エラーのため翻訳が停止しました。詳細はメインウィンドウを開いて確認してください。」、「音声認識が停止しました。…」</span><p><strong>原因：</strong>翻訳や音声認識の処理でエラーが起きました。アプリはそれらを自動で再起動しますが、10 分間に 5 回を超えて失敗すると翻訳を止めます。</p><p><strong>直し方：</strong><strong>停止</strong>を押してから<strong>開始</strong>を押します。一部が見つからない、または破損しているとアプリが表示した場合は、AI Translator を再インストールしてください。繰り返す場合はログを送ってください。</p></div>
</div>

<h2 id="models-macos">モデル、インストール、macOS と Windows</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">「モデルサーバーに接続できませんでした。インターネット接続を確認して、もう一度お試しください。」</span><p><strong>原因：</strong>接続がない、またはネットワークがダウンロードをブロックしています。</p><p><strong>直し方：</strong>ネットワークを確認してから、<strong>再試行</strong>を押します。</p></div>
<div class="card"><span class="card-title">「ダウンロードが完了しませんでした。「再開」を押すと、中断したところから続けられます。」または「ダウンロードしたファイルが破損していました。…」</span><p><strong>原因：</strong>接続が切れた、またはファイルが整合性の確認に通りませんでした。</p><p><strong>直し方：</strong><strong>再開</strong>を押します。アプリに「モデルが破損しています。もう一度ダウンロードしてください。」と表示された場合は、「設定 › モデル」で<strong>確認して再ダウンロード</strong>を押します。</p></div>
<div class="card"><span class="card-title">「ディスクの空き容量が足りません。…」または「モデルファイルをディスクに書き込めませんでした。」</span><p><strong>原因：</strong>ディスクにはダウンロードのサイズ + 1 GB の空きが必要です（Standard は約 2.5 GB、Lite は約 1.3 GB）。</p><p><strong>直し方：</strong>ディスクの空きを増やすか、Lite パックを選びます。</p></div>
<div class="card"><span class="card-title">「このコンピューターは最小要件を満たしていないため、モデルをダウンロードできません。」</span><p><strong>原因：</strong>最小要件を下回っています：Apple シリコンで RAM 8 GB の Mac、または RAM 8 GB で AVX2 対応の CPU を搭載した Windows 10/11 x64 の PC。アプリは「このコンピューターのプロセッサーには、AI Translator に必要な AVX2 がありません。…」のように理由を表示します。</p><p><strong>直し方：</strong>要件を満たすパソコンを使ってください。要件は<a href="/ja/download/">ダウンロードページ</a>をご覧ください。</p></div>
<div class="card"><span class="card-title">初めてアプリを開いたとき、macOS が開発元を確認できないと表示する</span><p><strong>原因：</strong>ブラウザーでダウンロードした .dmg からアプリを開いていて、macOS 版はアドホック署名で、まだ Apple の公証を受けていません。</p><p><strong>直し方：</strong>いちばん早いのは、<a href="/ja/download/#install-macos">ターミナルでインストールのコマンド</a>をもう一度実行することです（アプリがそのまま開きます）。または、<strong>完了</strong>を押し、「システム設定 › プライバシーとセキュリティ」を開いていちばん下までスクロールし、AI Translator の横の<strong>このまま開く</strong>を押します。<a href="/ja/guide/install-macos/">macOS へのインストール</a>をご覧ください。</p></div>
<div class="card"><span class="card-title">更新のあと、macOS がログインパスワードを求める</span><p><strong>原因：</strong>アドホック署名のビルドでは通常のことです。更新のたびにキーチェーンのダイアログが 1 つ（0.1.0 から 0.1.1 への最初の更新では 5 つ）と、録音の許可が 1 回出ることがあります。</p><p><strong>直し方：</strong>パスワードを入力して<strong>常に許可</strong>を押し、録音を許可してください。</p></div>
<div class="card"><span class="card-title">インストーラーを開くと、Windows に「Windows によって PC が保護されました」と表示される</span><p><strong>原因：</strong>ブラウザーでダウンロードした .exe を開いていて、Windows 版はまだコード署名されていないため、Microsoft Defender SmartScreen がブロックすることがあります。</p><p><strong>直し方：</strong>いちばん早いのは、<a href="/ja/download/#install-windows">PowerShell でインストールのコマンド</a>をもう一度実行することです（SmartScreen は出ません）。または、SHA-256 を確認し、<strong>詳細情報</strong>を押して「アプリ」の行にインストーラーのファイル名が表示されていることを確かめてから、<strong>実行</strong>を押します。「実行」ボタンがない場合は、PC のポリシーがブロックしている可能性があります。コンピューターの管理者にお問い合わせください。<a href="/ja/guide/install-windows/">Windows へのインストール</a>をご覧ください。</p></div>
<div class="card"><span class="card-title">ウイルス対策ソフトが Windows のインストーラーをブロックまたは削除する</span><p><strong>原因：</strong>インストーラーはコード署名されておらず、まだ広くダウンロードされていないため、一部の製品が疑わしいと判断します。</p><p><strong>直し方：</strong>SHA-256 をもう一度確認してください。一致しているのにブロックされる場合は、お使いのウイルス対策ソフトの名前を添えて<a href="/ja/contact/">サポートにご連絡ください</a>。</p></div>
</div>

<h2 id="license-quota">ライセンス、翻訳時間、お試し</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">「翻訳の残り時間を使い切りました · … にリセット」</span><p><strong>原因：</strong>今日の 30 分（Free）またはサイクルの時間（Monthly：50 時間、6 Months：100 時間）を使い切りました。</p><p><strong>直し方：</strong>画面に表示されたリセットの時刻まで待つか、<a href="/ja/guide/buy-and-activate/">更新またはプランを変更</a>してください。</p></div>
<div class="card"><span class="card-title">「10 日間のお試しが終了しました」</span><p><strong>原因：</strong>Free はパソコンごとに 10 日間のお試しで、再インストールしてもやり直しにはなりません。</p><p><strong>直し方：</strong>翻訳を続けるには、Monthly、6 Months、Yearly を購入してください。</p></div>
<div class="card"><span class="card-title">「無料お試しを開始するには、一度インターネットに接続してください」または「14 日間プランを確認できなかったため、Free を使用しています。インターネットに接続してください。」</span><p><strong>原因：</strong>接続がなくお試しを登録できなかった、または有料プランでライセンスの確認がないまま 14 日を過ぎました。</p><p><strong>直し方：</strong>インターネットに接続します。このパソコンでまだお試しを登録していない場合は、もう一度<strong>開始</strong>を押すとアプリが登録します。有料プランの場合は、「設定 › ライセンス」で<strong>今すぐ確認</strong>を押します。</p></div>
<div class="card"><span class="card-title">「このキーは 2 台のコンピューターで使用されているため、ロックされています。…」</span><p><strong>原因：</strong>キーを 2 台のパソコンが使っています。</p><p><strong>直し方：</strong>どちらか 1 台からキーを削除してから<strong>再試行</strong>を押します：<a href="/ja/guide/buy-and-activate/#switch-computers">パソコンの変更の方法</a>をご覧ください。</p></div>
<div class="card"><span class="card-title">「コンピューターの時計が正しくないようです。正しい時刻に設定して、もう一度お試しください。」または「このコンピューターの時計が戻されています。…」</span><p><strong>原因：</strong>システムの時計が過去に戻されました。</p><p><strong>直し方：</strong>正しい時刻に設定し（できれば自動設定）、アプリが確認できるようインターネットに接続してください。</p></div>
<div class="card"><span class="card-title">「このキーは無効です。…」、「コンピューターの変更が頻繁すぎたため、このキーは一時的にロックされています。…」、「この AI Translator は正規品ではないため、…」</span><p><strong>原因：</strong>キーの入力ミス、パソコンの変更が多すぎる、または公式ではないインストーラー。</p><p><strong>直し方：</strong>メールのキーをもう一度貼り付けます。キーがロックされた場合はサポートにご連絡ください。私たちがお送りしたリンクか aitranslator.vn から、公式のビルドをもう一度ダウンロードしてください。</p></div>
</div>

<h2 id="type-and-translate">入力翻訳</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">⌃⌥G（Ctrl+Alt+G）を押しても入力ボックスが開かない</span><p><strong>原因：</strong>入力翻訳がオフになっている、またはほかのアプリがそのショートカットを使っています。</p><p><strong>直し方：</strong>「設定 › 入力翻訳」でオンにします。Windows で「設定 › ショートカット」にショートカットが登録されていないと表示される場合は、別のものを選びます。macOS でほかのアプリも ⌃⌥G を使っている場合は、どちらかのショートカットを変更します。</p></div>
<div class="card"><span class="card-title">「翻訳をコピーしました。自動で貼り付けるには、アクセシビリティで AI Translator を許可してください。」</span><p><strong>原因：</strong>macOS が AI Translator にアクセシビリティの許可を与えていない、またはアプリの更新のあとで許可が失われました。</p><p><strong>直し方：</strong>今回はチャット欄で ⌘V を押して貼り付けます。アプリに貼り付けさせるには、<strong>自動貼り付けをオンにする</strong>を押し、アクセシビリティで AI Translator をオンにします。すでにオンなのにアプリが尋ね続ける場合（アプリの更新のあとによくあります）：バージョン 0.1.14 からは、<strong>自動貼り付けをオンにする</strong>ボタンが古い許可を自分で消すので、もう一度オンにするだけで済みます。それより古いバージョンでは、一覧から AI Translator を削除し（− ボタン）、もう一度追加してください（+ ボタン）。<a href="/ja/guide/type-and-translate/#accessibility">入力翻訳</a>をご覧ください。</p></div>
<div class="card"><span class="card-title">Enter を押しても、翻訳がチャット欄に入らない</span><p><strong>原因：</strong>その欄が自動の貼り付けを受け付けない（パスワードの欄、Windows で管理者として実行しているアプリ、貼り付けをブロックするアプリ）、またはチャットのウィンドウが時間内に前面に来ませんでした。</p><p><strong>直し方：</strong>翻訳はクリップボードに残っています。チャット欄をクリックして、⌘V か Ctrl+V で貼り付けてください。</p></div>
<div class="card"><span class="card-title">「1 行が長すぎて翻訳できません。複数の行またはメッセージに分けてください。」</span><p><strong>原因：</strong>メッセージの 1 行が長すぎて一度に翻訳できません（メッセージ全体では 4000 文字まで使えます）。</p><p><strong>直し方：</strong>Shift+Enter を押して適当なところで改行するか、複数のメッセージに分けてください。</p></div>
</div>

<h2 id="send-logs">ログを送って問題を報告する</h2>
<p>アプリでエラーが起きると（突然停止した、アプリのエラーで翻訳のセッションが止まった、補助プログラムが停止して再起動した）、アプリは<strong>エラーレポートを自動で私たちに送ります</strong>：マシンの情報とログの関係する部分で、個人フォルダーのパス、キー、トークン、メールアドレスは取り除かれ、音声や文字起こしのテキストは含みません。レポートはアプリが翻訳していないときだけ送られます。これは初期設定でオンで、<strong>設定 › プライバシー › エラーレポートを自動送信</strong>でオフにできます。<a href="/ja/data-security/#error-reports">レポートに含まれるものと保存期間</a>をご覧ください。</p>
<p>アプリが止まらない問題（字幕が間違っている、遅いなど）の場合は、<strong>このアプリについて › ログをサポートに送信</strong>を選びます。自動送信をオフにしていてもすぐにレポートが送られ、<strong>レポートコード</strong>（<code>R-XXXX-XXXX</code> のような形式）が表示されます。私たちがレポートを見つけられるよう、そのコードを<a href="/ja/contact/">サポート</a>（support@aitranslator.vn）へのメールに書いてください。</p>
<p>ログを自分で見たり添付したりするには、<strong>このアプリについて › ログフォルダーを開く</strong>を選んで <code>app.log</code> を探します（macOS：<code>~/Library/Logs/</code> の中の <code>com.aitranslator.desktop</code> フォルダー。Windows：<code>%LOCALAPPDATA%\\com.aitranslator.desktop\\logs\\</code>）。このファイルはパソコンに残り、音声、文字起こしのテキスト、完全なライセンスキーは含みません。</p>
${appShot({
  slug: "app-about",
  lang: "ja",
  alt: "このアプリについての画面：アプリ名、バージョンの行、ログフォルダーを開くボタンとログをサポートに送信ボタン、利用規約とプライバシーの欄",
  caption: "このアプリについて：バージョン、ログフォルダーを開く、ログをサポートに送信。",
})}
<p>表のとおりに試しても問題が繰り返す場合、キーがロックまたは取り消された場合、お支払いがうまくいかない場合は、サポートにご連絡ください。次の情報を添えてください：</p>
<ul>
<li>アプリのバージョン（このアプリについて ›「バージョン …」、または左のサイドバーの下、たとえば「Monthly · v0.1.6」）、macOS か Windows のバージョン、チップまたはプロセッサー（たとえば MacBook Air M2）、RAM、Windows PC ではグラフィックスカード。</li>
<li>モデルパック（Standard または Lite、「設定 › モデル」）とライセンスのプラン。</li>
<li>表示されたとおりのメッセージかスクリーンショット、使っている会議アプリ、直前にしたこと。</li>
<li>レポートコード（「ログをサポートに送信」を押した場合）と、お支払いの問題なら注文番号。添付したい場合は <code>app.log</code>。</li>
</ul>

<h2 id="quick-answers">すぐわかる回答</h2>
${faq(QUICK)}
`,
})}
${docNav(
  [
    { href: "/ja/guide/buy-and-activate/", kicker: "前へ", title: "プランの購入、キーの有効化、パソコンの変更" },
    { href: "/ja/faq/", kicker: "あわせて読む", title: "よくある質問" },
  ],
  "関連するガイド",
)}
</div></section>
`,
};
