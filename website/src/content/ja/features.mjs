import { dataFlow, pageHero, sectionHead, feature, checkList, callout, ctaBand, appShot, overlayShot, facts, keys, icon } from "../../build/components.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "機能", path: "/ja/features/" },
];

export default {
  id: "features",
  lang: "ja",
  path: "/ja/features/",
  title: "AI Translator の機能：字幕、用語集、書き出し",
  description:
    "5 言語のリアルタイム翻訳字幕、字幕バー、チャット用の入力翻訳、用語集、履歴、TXT/SRT/Markdown 書き出し。すべてパソコン上でオフラインで動きます。",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({ crumbs, title: "パソコン上で動く、会議のリアルタイム翻訳機能", lead: "AI Translator が今できることを、アプリでの実際の動きそのままにご紹介します。有料プランだけの機能ははっきり示しています。" })}

<section class="section-tight"><div class="container">
<h2 class="sr-only">機能の一覧</h2>
<div class="grid grid-4 reveal">
<a class="card card-link" href="#live-translation"><h3>リアルタイム翻訳</h3><p class="muted">5 言語、自動検出</p></a>
<a class="card card-link" href="#subtitle-bar"><h3>字幕バー</h3><p class="muted">ドラッグ、ロック、文字サイズ変更</p></a>
<a class="card card-link" href="#transcript"><h3>文字起こし</h3><p class="muted">履歴、書き出し（Pro）</p></a>
<a class="card card-link" href="#glossary"><h3>用語集</h3><p class="muted">人名と用語（Pro）</p></a>
<a class="card card-link" href="#type-and-translate"><h3>入力翻訳</h3><p class="muted">相手の言語でチャット</p></a>
<a class="card card-link" href="#audio-source"><h3>音声ソース</h3><p class="muted">どの会議アプリでも、ボット不要</p></a>
<a class="card card-link" href="#shortcuts"><h3>ショートカットとトレイ</h3><p class="muted">会議から離れずに操作</p></a>
<a class="card card-link" href="#models"><h3>モデルとハードウェア</h3><p class="muted">Standard と Lite のパック</p></a>
<a class="card card-link" href="#performance"><h3>パフォーマンス</h3><p class="muted">測定値と測定条件</p></a>
</div>
</div></section>

<section class="section band-dark" id="on-device-ai"><div class="container">
${sectionHead({ eyebrow: "デバイス上の AI", title: "会議をクラウドに預けない AI 翻訳", text: "音声認識用と翻訳用の 2 つの AI モデルが、あなたのパソコン上で直接動きます。音声や会議の内容をサーバーやクラウドの AI サービスに送る工程はありません。", center: true })}
${dataFlow("ja")}
<div class="grid grid-3">
${feature({ icon: "cpu", title: "ローカルで動く 2 つの AI モデル", text: "1 つが音声を認識し、もう 1 つが翻訳します。どちらも一度ダウンロードすれば、GPU または CPU を使ってあなたのパソコン上で動きます。", accent: true })}
${feature({ icon: "zap", title: "遠回りしないから低遅延", text: "サーバーとの往復がないため、話し手が文を言い終えるとすぐに翻訳が表示されます。Mac M4 Pro での中央値は 1.1 秒未満で、測定条件は下の「パフォーマンス」に記載しています。" })}
${feature({ icon: "lock", title: "会話のデータはパソコンに残ります", text: "音声は RAM 上にだけ存在し、文字起こしと翻訳はパソコンに残ります。履歴は初期設定でオフで、オンにした場合もパソコン上で暗号化されます。" })}
</div>
</div></section>

<section class="section" id="live-translation"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">リアルタイム翻訳</span>
<h2>聞き取り、認識、翻訳、字幕表示をひとつの流れで</h2>
<p>AI Translator はパソコンで再生されている音声を取り込み、文ごとに区切って音声を認識し、翻訳して字幕バーに表示します。Mac M4 Pro では、話し手が文を言い終えてから約 1 秒（中央値）で翻訳全体が表示されます。ほかのパソコンでは遅くなることがあります。<a href=\"#performance\">測定結果</a>をご覧ください。</p>
${checkList([
  "話される音声と翻訳の両方で <strong>5 言語</strong>：英語、中国語（中文）、日本語、韓国語（한국어）、ベトナム語（Tiếng Việt）。今後さらに言語を追加する予定です（時期は未定）",
  "<em>会議で話される言語</em>でチェックした言語の中から話されている言語を<strong>自動検出</strong>。話される言語がわかっているときは、<em>音声の言語</em>で 1 つに<strong>固定</strong>することもできます",
  "すでに読みたい言語で話された文は、翻訳し直さずにそのまま表示します",
  "まだ確定していない文は薄く表示され、話し手が話し続けると完成した文に置き換わります",
  "音楽や無音のときに音声認識が作り出しがちな「幻の文」を取り除きます",
  "認識した中国語は簡体字に変換します",
])}
</div>
<div>
${appShot({ slug: "app-home-free", lang: "ja", alt: "言語のカードがある AI Translator のメイン画面：翻訳先の言語と、会議で話される言語", caption: "言語のカード：読みたい言語と、会議で話される可能性のある言語を選びます。" })}
</div>
</div>
${callout({ title: "字幕は一方向です：会議からあなたへ。", text: "AI Translator は、パソコンから流れる音声をあなたの言語に翻訳します。あなた自身の声を会議に向けて翻訳することは、まだできません。チャットで文字で返信するときは<a href=\"#type-and-translate\">入力翻訳</a>を使ってください。自分の言語で入力すると、アプリが翻訳をチャット欄に貼り付けます。両方の側がアプリをインストールすれば、それぞれが相手の字幕を読めます。" })}
</div></section>

<section class="section section-alt" id="subtitle-bar"><div class="container">
<div class="split reverse">
<div class="stack-lg reveal">
<span class="eyebrow">字幕バー</span>
<h2>カスタマイズでき、会議の邪魔をしないフローティングバー</h2>
<p>字幕バーは、半透明の背景を持つ枠なしの独立したウィンドウです。常に最前面に表示され、会議アプリのフォーカスを奪わないので、チャットへの入力やボタン操作をいつもどおり続けられます。</p>
${checkList([
  "<strong>ドラッグ</strong>で移動、端や角をドラッグでサイズ変更。位置とサイズは画面ごとに記憶されます",
  "<strong>文字サイズ</strong> 14〜48 px、<strong>文字色 5 種類</strong>（白、黄、緑、水色、オレンジ）、<strong>背景色 5 種類</strong>、背景の不透明度 0〜100%",
  "<strong>ロック</strong>：マウスのクリックがバーを通り抜け、ボタンも邪魔になりません。ロック解除はショートカットかトレイのメニューから",
  "直近 1,000 文を保持。マウスホイールやショートカットで<strong>前の文にさかのぼり</strong>、<em>最新</em>ボタンで現在の文に戻れます",
  "翻訳の上に小さく<strong>原文</strong>を表示（初期設定でオン、オフにもできます）",
  "隅の小さな表示：音を検出して聞き取り中、モデルを読み込み中、処理が遅れている、翻訳の残り時間が 5 分未満",
])}
<p class="more-link"><a href="/ja/guide/subtitle-bar-and-shortcuts/">字幕バーとショートカットの使い方を見る ${icon("arrow-right")}</a></p>
</div>
<div class="stack-lg">
${overlayShot({ slug: "overlay-custom", lang: "ja", alt: "大きな文字サイズで、紺色の背景に黄色の文字を表示した字幕バー", caption: "同じバーを黄色の文字、紺色の背景、サイズ 26 にしたところ。" })}
${appShot({ slug: "app-settings-subtitles", lang: "ja", alt: "字幕の設定：例文のプレビュー、文字サイズ、文字色、背景色、背景の不透明度、原文を表示する設定", caption: "設定 › 字幕：プレビューとバーはすぐに反映されます。" })}
</div>
</div>
</div></section>

<section class="section" id="audio-source"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-settings-audio", lang: "ja", alt: "音声の設定：音声ソースの選択（Zoom のみ）と、音を出しているアプリのリストを更新するボタン", caption: "設定 › 音声：システム全体を聞き取るか、1 つのアプリだけを聞き取るかを選べます（macOS）。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">音声ソース</span>
<h2>どの会議アプリでも、ボットもプラグインも不要</h2>
<p>アプリはシステムの音声を取り込むため、AI Translator は音が出るものなら何でも使えます：Zoom、Microsoft Teams、Google Meet、Zalo PC、ウェビナー、動画、オンライン講座。</p>
${checkList([
  "<strong>macOS：</strong>システム全体（アプリ自身を除く）か、音を出している 1 つのアプリだけを聞き取れるので、ほかのアプリの通知音を誤って翻訳しません",
  "<strong>Windows：</strong>既定の再生デバイス、または選んだデバイス",
  "ヘッドホンを差したり Bluetooth に接続したりして再生デバイスが切り替わると、ソースは自動で開き直されます",
  "<strong>文を区切る間の長さ</strong>は 50〜800&nbsp;ms で調整可能。短くすると字幕が早く出て、長くすると文が途中で切れにくくなります",
])}
<p>macOS では、初めて「開始」を押したときにシステムから<em>システムオーディオの録音</em>の許可を求められます。アプリはマイクを使いません。<a href="/ja/guide/macos-audio-permission/">音声の許可の与え方を見る</a>。Windows ではこの許可は不要です。</p>
</div>
</div>
</div></section>

<section class="section section-alt" id="transcript"><div class="container">
${sectionHead({ eyebrow: "文字起こし、履歴、書き出し", title: "聞いた内容を、好きな形で残す", text: "現在のセッションの文字起こしはすべてのプランで使えます。履歴の保存とファイルへの書き出しは Pro 機能です。", center: true })}
<div class="split">
<div>
${appShot({ slug: "app-transcript", lang: "ja", alt: "時刻、原文、翻訳のある文字起こし。検索欄、すべてコピーボタン、書き出し形式の選択", caption: "文字起こし：検索、コピー、TXT・SRT・Markdown への書き出し。" })}
</div>
<div class="stack-lg reveal">
${checkList([
  "<strong>文字起こし：</strong>各行に時刻、原文、翻訳があり、検索とすべてコピーはすべてのプランで使えます",
  "TXT、SRT、Markdown に<strong>書き出し</strong>。SRT では、テキストを翻訳にするか原文にするかを選べます <span class=\"badge badge-pro\">Pro</span>",
  "<strong>セッションの履歴：</strong>セッションを 1 つずつ確認、開く、削除、またはまとめて削除 <span class=\"badge badge-pro\">Pro</span>",
  "履歴は<strong>初期設定でオフ</strong>です。オンにすると、パソコン上に暗号化して保存され、鍵はキーチェーン（macOS）または資格情報マネージャー（Windows）に保管されます",
  "<strong>履歴と用語集の削除</strong>は、ボタン 1 つでこのパソコンから行えます（確認のあと。モデルも削除する別のボタンもあります）。すべてのプランで利用可能",
])}
<p class="more-link"><a href="/ja/guide/history-and-export/">履歴と書き出しのガイドを読む ${icon("arrow-right")}</a></p>
${appShot({ slug: "app-history", lang: "ja", alt: "保存したセッションを日時、分数、文の数、プレビューとともに一覧表示する履歴画面", caption: "履歴：パソコンに保存したセッション。" })}
</div>
</div>
</div></section>

<section class="section" id="glossary"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-glossary", lang: "ja", alt: "用語と訳語のペア、CSV のインポートとエクスポートのボタンがある用語集", caption: "用語集：追加、編集、削除、CSV のインポートとエクスポート。" })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">用語集 <span class="badge badge-pro">Pro</span></span>
<h2>人名や用語のヒントを翻訳に渡す</h2>
<p>製品名、取引先の名前、業界の用語を「原語 → 訳語」のペアで登録します。文にそれらが含まれていると、アプリはヒントとして翻訳に渡します。</p>
${checkList([
  "最大 <strong>500</strong> 件。CSV のインポートとエクスポートに対応（2 列、UTF-8）",
  "照合では大文字と小文字を区別しません。中国語、日本語、韓国語の用語は単語の途中でも一致します",
  "1 文につき関連する項目を最大 20 件使います",
])}
<p class="small muted">用語は翻訳へのヒントなので、毎回正しく使われるとは限りません。アプリにもそう表示されます。</p>
<p class="more-link"><a href="/ja/guide/glossary/">用語集のガイドを読む ${icon("arrow-right")}</a></p>
</div>
</div>
</div></section>

<section class="section section-alt" id="type-and-translate"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">入力翻訳</span>
<h2>使っているチャット欄で、相手の言語でチャット</h2>
<p>使っているアプリのチャット欄で ${keys(["⌃", "⌥", "G"])}（Windows では ${keys(["Ctrl", "Alt", "G"])}）を押します。浮かんで表示される入力ボックスに自分の言語で入力すると、すぐ下に翻訳が表示されます。Enter を押すと翻訳がチャット欄に貼り付けられるので、確認してからもう一度 Enter を押して送信します。</p>
${checkList([
  "字幕の設定から取った<strong>会話の相手の言語</strong>、または選んだ言語に翻訳します",
  "<strong>有効なすべてのプラン</strong>に含まれ、お試し中の Free でも使えます。翻訳時間は<strong>消費しません</strong>",
  "翻訳はパソコン上で行われ、入力した内容とその翻訳が外に出ることはありません",
  "いつものキーボードと入力方法で入力できます。翻訳に失敗したとき、アプリが原文を貼り付けることはありません",
])}
<p class="small muted">macOS では、自動で貼り付けるにはアクセシビリティの許可が必要です。許可がない場合は翻訳をコピーするので、⌘V で貼り付けてください。<a href="/ja/guide/type-and-translate/">入力翻訳のガイド</a>をご覧ください。</p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "ja", alt: "日本語のメッセージと、その下に英語訳が表示された入力翻訳ボックス", caption: "入力翻訳ボックス：Enter を押すと翻訳がチャット欄に貼り付けられます。" })}
</div>
</div>
</div></section>

<section class="section" id="shortcuts"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">ショートカットとシステムトレイ</span>
<h2>会議から離れずに操作</h2>
<p>6 つのグローバルショートカットは、AI Translator が前面のウィンドウでなくても使えます。それぞれ「設定 › ショートカット」で変更できます。</p>
<div class="table-wrap" role="region" aria-label="キーボードショートカット" tabindex="0"><table>
<thead><tr><th scope="col">操作</th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">翻訳の開始／停止</th><td>${keys(["⌃", "⌥", "T"])}</td><td>${keys(["Ctrl", "Alt", "T"])}</td></tr>
<tr><th scope="row">字幕の表示／非表示</th><td>${keys(["⌃", "⌥", "H"])}</td><td>${keys(["Ctrl", "Alt", "H"])}</td></tr>
<tr><th scope="row">字幕のロック／ロック解除</th><td>${keys(["⌃", "⌥", "L"])}</td><td>${keys(["Ctrl", "Alt", "L"])}</td></tr>
<tr><th scope="row">字幕を上にスクロール（古い文）</th><td>${keys(["⌃", "⌥", "PageUp"])}</td><td>${keys(["Ctrl", "Alt", "PageUp"])}</td></tr>
<tr><th scope="row">字幕を下にスクロール（新しい文）</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
<tr><th scope="row">入力翻訳ボックスを開く／閉じる</th><td>${keys(["⌃", "⌥", "G"])}</td><td>${keys(["Ctrl", "Alt", "G"])}</td></tr>
</tbody></table></div>
<p class="small muted">macOS の ⌃ は Control、⌥ は Option です。ショートカットには Ctrl、Alt、Cmd/Win のいずれか 1 つ以上が必要です。</p>
<p>メニューバーのアイコン（macOS）またはシステムトレイのアイコン（Windows）から、翻訳の開始・停止、字幕の表示・非表示とロック、メインウィンドウを開く操作ができます。ウィンドウを閉じてもアプリはトレイに隠れるだけです。完全に終了するには<em>終了</em>を選んでください。</p>
</div>
<div>
${appShot({ slug: "app-settings-hotkeys", lang: "ja", alt: "macOS の初期設定の 6 つのショートカットを表示したショートカットの設定", caption: "設定 › ショートカット：「変更」を押してから新しいキーの組み合わせを押します。" })}
</div>
</div>
</div></section>

<section class="section section-alt" id="models"><div class="container stack-lg">
<div class="model-intro">
<div class="stack-lg reveal">
<span class="eyebrow">モデルとパソコン</span>
<h2>2 つのモデルパックから、アプリが合うものをおすすめ</h2>
<p>認識と翻訳のモデルは一度ダウンロードすれば、そのあとはすべてあなたのパソコン上で動きます。アプリは RAM、ディスクの空き容量、グラフィックスカードを確認して、パックをおすすめします。</p>
</div>
</div>
<div class="table-wrap reveal" role="region" aria-label="モデルパックの比較" tabindex="0"><table>
<thead><tr><th scope="col"><span class="sr-only">項目</span></th><th scope="col">Standard パック</th><th scope="col">Lite パック</th></tr></thead>
<tbody>
<tr><th scope="row">ダウンロード</th><td>約 2.5 GB</td><td>約 1.3 GB</td></tr>
<tr><th scope="row">実行中の RAM（M4 Pro）</th><td>約 2.9 GiB</td><td>約 1.8〜1.9 GiB</td></tr>
<tr><th scope="row">アプリがおすすめする環境</th><td>16 GB 以上の Mac、または 16 GB 以上で VRAM 6 GB のディスクリート GPU を搭載した Windows</td><td>8 GB 以上 16 GB 未満のパソコン、または十分なディスクリート GPU のない Windows</td></tr>
</tbody></table></div>
<p class="small muted">Lite パックは、ベトナム語、日本語、韓国語、中国語の音声認識の精度が Standard より低くなります。これらの言語をよく聞く場合は Standard パックを選んでください。</p>
${facts([
  ["macOS", "macOS 14.2 以降、Apple シリコン（M1 以降）<small>Intel Mac 版はありません</small>"],
  ["RAM", "8 GB 以上、16 GB 推奨"],
  ["ディスク", "ダウンロードするモデルのサイズに加えて 1 GB 以上の空き"],
  ["Windows", "Windows 10/11 64 ビット（x64）、AVX2 対応の CPU<small>Standard パックには VRAM 6 GB 以上のディスクリート GPU を推奨。まだコード署名されていないため、インストール時に SmartScreen が警告することがあります。Windows での遅延は内蔵グラフィックスのノートパソコン 1 台で予備テストをしただけで、Mac M4 Pro より遅くなります（「パフォーマンス」をご覧ください）</small>"],
])}
</div></section>

<section class="section" id="performance"><div class="container">
${sectionHead({ eyebrow: "パフォーマンス", title: "実際の測定値を、測定条件とともに", text: "公開するのは、測定したマシンで実際に測定した値だけです。テストしていないマシンもはっきりお伝えします。", center: true })}
<div class="table-wrap reveal" role="region" aria-label="測定したパフォーマンス" tabindex="0"><table>
<thead><tr><th scope="col">測定（Mac M4 Pro 24 GB、macOS 26、Apple GPU）</th><th scope="col">Standard パック</th><th scope="col">Lite パック</th></tr></thead>
<tbody>
<tr><th scope="row">遅延の中央値（p50）：話し手が文を言い終えてから翻訳全体が表示されるまで</th><td>0.76〜1.03 秒</td><td>0.61〜0.84 秒</td></tr>
<tr><th scope="row">p90 の遅延</th><td>0.94〜1.34 秒</td><td>0.73〜1.14 秒</td></tr>
<tr><th scope="row">翻訳の最初の単語が表示されるまで（p50）</th><td>0.63〜0.69 秒</td><td>0.52〜0.57 秒</td></tr>
<tr><th scope="row">実行中の RAM</th><td>2.9 GiB</td><td>1.8〜1.9 GiB</td></tr>
</tbody></table></div>
<div class="grid grid-2">
${feature({ icon: "gauge", title: "長時間のセッション", text: "5 時間 23 分の連続セッション 1 回（英語の講義動画、アドホック署名のリリースビルド）：6,019 セグメント、エラーなし、遅延の中央値 0.48 秒。2 時間の安定性テストでは、どのコンポーネントも再起動しませんでした。" })}
${feature({ icon: "languages", title: "翻訳と認識の品質", text: "アプリ自身の翻訳経路を使い、ベトナム語が関わる 8 方向で行った社内テストでは、Standard パックの翻訳モデルは翻訳品質の自動スコア（0〜1、下の表）で平均約 0.84 でした。翻訳モデルは、別のテストセットで複数のモデルを比較して選びました。きれいな読み上げ音声では、Standard パックのベトナム語認識の単語誤り率は 8.7% です。これは読み上げ音声であり、実際の会議の会話ではありません。" })}
</div>
<h3 class="reveal" id="quality-by-direction">方向別の翻訳品質と認識品質</h3>
<p class="reveal">翻訳品質の自動スコアは、アプリ自身の翻訳経路（実際の利用と同じ構成）で、1 方向につき 100 文（ベトナム語 → 中国語、日本語、韓国語は 40 文）で測定しました。0〜1 の相対的なスコアで、高いほど良い結果です。<strong>正解率のパーセンテージではありません</strong>。</p>
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">方向（テキスト）</th><th scope="col">Standard パック</th><th scope="col">Lite パック</th></tr></thead>
<tbody>
<tr><th scope="row">英語 → ベトナム語</th><td>0.842</td><td>0.841</td></tr>
<tr><th scope="row">中文 → ベトナム語</th><td>0.829</td><td>0.831</td></tr>
<tr><th scope="row">日本語 → ベトナム語</th><td>0.830</td><td>0.815</td></tr>
<tr><th scope="row">한국어 → ベトナム語</th><td>0.834</td><td>0.822</td></tr>
<tr><th scope="row">ベトナム語 → 英語</th><td>0.821</td><td>0.822</td></tr>
<tr><th scope="row">ベトナム語 → 中文</th><td>0.836</td><td>0.821</td></tr>
<tr><th scope="row">ベトナム語 → 日本語</th><td>0.847</td><td>0.845</td></tr>
<tr><th scope="row">ベトナム語 → 한국어</th><td>0.851</td><td>0.842</td></tr>
</tbody></table></div>
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">音声認識（誤り率、低いほど良い）</th><th scope="col">Standard パック</th><th scope="col">Lite パック</th></tr></thead>
<tbody>
<tr><th scope="row">英語（単語誤り）</th><td>5.4%</td><td>6.6%</td></tr>
<tr><th scope="row">ベトナム語（単語誤り）</th><td>8.7%</td><td>22.5%</td></tr>
<tr><th scope="row">中文（文字誤り）</th><td>5.6%</td><td>9.6%</td></tr>
<tr><th scope="row">日本語（文字誤り）</th><td>4.5%</td><td>13.1%</td></tr>
<tr><th scope="row">한국어（文字誤り）</th><td>4.1%</td><td>8.2%</td></tr>
</tbody></table></div>
<p class="small muted reveal">読み方：翻訳のテストセットは日常の話し言葉に寄っているため、会議の発話の目安にすぎません。認識はきれいな読み上げ音声（1 言語あたり約 15 分）で測定したもので、実際の会議の会話ではありません。狭帯域の音声（通話モードの Bluetooth ヘッドセットのような音）を模したテストでは誤り率が上がりました。実際のヘッドセットではテストしていません。上の 8 方向はすべてベトナム語が関わる方向です。英語、中文、日本語、한국어 のあいだのほかの 12 方向も動作しますが、品質スコアはまだありません。Lite パックは、ベトナム語、日本語、韓国語、中国語の認識が目に見えて不正確になります。</p>
${callout({ kind: "warn", title: "測定していないこと、約束しないこと", text: "上の数値はすべて Mac M4 Pro 1 台で、文を区切る間の長さを 300&nbsp;ms にして測定したものです（アプリの現在の初期設定は 50&nbsp;ms。5 時間のセッションは初期設定で実施）。次の項目は測定していません：M1 の Mac、8 GB のパソコン、Windows のディスクリート GPU、バッテリーと消費電力、実際の会議の会話や Bluetooth ヘッドセット経由での精度、ベトナム語が関わらない方向の翻訳品質（動作はしますが、公開できる品質スコアがありません）。Windows ノートパソコン 1 台（Core i5-1345U、内蔵グラフィックス、RAM 32 GB、Windows 11。設定ごとに 17〜23 文のセッションを 6 回）での予備テストでは、遅延の中央値は Lite パックで 1.3〜2.6 秒、Standard パックで 2.7〜5.4 秒で、遅延の目標を満たしませんでした。このノートパソコンは最低要件のマシンより高性能なので、これは非力な PC での数値ではありません。" })}
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "プラン別", title: "どの機能がどのプランに含まれるか", center: true })}
<div class="table-wrap reveal" role="region" aria-label="プラン別の機能" tabindex="0"><table class="compare">
<thead><tr><th scope="col">機能</th><th scope="col">Free（お試し）</th><th scope="col">Monthly</th><th scope="col">6 Months</th><th scope="col">Yearly</th></tr></thead>
<tbody>
<tr><th scope="row">リアルタイム翻訳字幕、5 言語</th><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">カスタマイズできる字幕バー、ショートカット、トレイ</th><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">文字起こしの表示、検索、コピー</th><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">用語集（最大 500 件）</th><td><span class="no">なし</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">セッション履歴の保存</th><td><span class="no">なし</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">TXT、SRT、Markdown への書き出し</th><td><span class="no">なし</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td><td><span class="yes">あり</span></td></tr>
<tr><th scope="row">翻訳時間</th><td>1 日 30 分、10 日間</td><td>30 日ごとに 50 時間</td><td>180 日間、30 日ごとに 100 時間</td><td>365 日間、無制限</td></tr>
<tr><th scope="row">価格（VietQR、VND）</th><td>0 ₫</td><td>50,000 ₫</td><td>269,000 ₫</td><td>500,000 ₫</td></tr>
<tr><th scope="row">価格（国際カード、USD、税抜）</th><td>—</td><td>US$3.99</td><td>US$21.99</td><td>US$39.99</td></tr>
</tbody></table></div>
<p class="center-text reveal"><a class="btn btn-primary" href="/ja/pricing/">料金の詳細を見る ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "実際の会議で試してみてください", text: "1 日 30 分、10 日間の無料お試し。カードもアカウントも不要です。", primary: { href: "/ja/download/", label: "ダウンロード" }, secondary: { href: "/ja/guide/quick-start/", label: "クイックスタートガイドを読む" } })}
`,
};
