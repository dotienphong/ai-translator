import { pageHero, callout, appShot, overlayShot, keys, docLayout, docNav } from "../../build/components.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ガイド", path: "/ja/guide/" },
  { name: "字幕バーとショートカット", path: "/ja/guide/subtitle-bar-and-shortcuts/" },
];

const toc = [
  { level: 2, id: "move-and-resize", text: "移動とサイズ変更" },
  { level: 2, id: "lock", text: "ロックとロック解除" },
  { level: 2, id: "show-hide", text: "表示と非表示" },
  { level: 2, id: "scroll", text: "前の文にスクロールする" },
  { level: 2, id: "style", text: "文字サイズ、色、不透明度" },
  { level: 2, id: "speakers", text: "誰が話しているか：色と名前" },
  { level: 2, id: "indicators", text: "バーの表示の意味" },
  { level: 2, id: "shortcuts", text: "初期設定のショートカット" },
  { level: 2, id: "change-shortcuts", text: "ショートカットを変更する" },
  { level: 2, id: "menu-bar", text: "メニューバーとトレイのメニュー" },
  { level: 2, id: "closing-the-window", text: "ウィンドウを閉じても終了しない理由" },
];

export default {
  id: "guide-subtitle-bar",
  lang: "ja",
  path: "/ja/guide/subtitle-bar-and-shortcuts/",
  title: "AI Translator の字幕バーとショートカット",
  description:
    "AI Translator の字幕バーの移動、ロック、非表示、スクロール、文字サイズ・色・不透明度の設定と、macOS・Windows の初期設定のショートカットとメニューバーのメニュー。",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "字幕バーとショートカット",
  lead: "字幕バーは常に最前面に表示されるフローティングウィンドウで、会議アプリからフォーカスを奪わずに翻訳を表示します。ドラッグで移動し、端をドラッグしてサイズを変え、ロックしてマウスを通過させ、⌃⌥T（開始・停止）や ⌃⌥H（表示・非表示）などのショートカットで操作します。",
  meta: "<span>macOS と Windows</span> <span>更新日 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "このガイドの内容",
  body: `
<h2 id="move-and-resize">移動とサイズ変更</h2>
<p>バーがロックされていないときは、バーのどこをドラッグしても移動できます。上端の中央にある小さなつまみが、移動できることを示しています。端や角をドラッグするとサイズを変えられ、最小サイズは 320 × 80 です。アプリは画面ごとに位置とサイズを別々に記憶します。初期設定では、バーは画面の中央、下端の近くにあります。</p>
${overlayShot({ slug: "overlay-default", lang: "ja", alt: "初期設定の字幕バー：半透明の黒い背景に白い文字で、原文を上に小さく、その下に翻訳を表示", caption: "初期設定の字幕バー。ロックされていないときは、上端の中央に小さなつまみが表示され、枠線が明るくなります。" })}

<h2 id="lock">ロックとロック解除（クリックを通過）</h2>
<p>バーをロックすると、マウスがバーをそのまま通過するので、会議のボタンやチャット欄をふさぐことがありません。ロック中は上のつまみが消え、枠線が薄くなり、バーにボタンはありません。</p>
<ul>
<li>ホーム画面の<strong>字幕バー</strong>カードで、<strong>ロック（クリックを通過）</strong>または<strong>ロック解除</strong>を押します。</li>
<li>ショートカット ${keys(["⌃", "⌥", "L"])}。</li>
<li>メニューバーのメニュー：<strong>字幕をロック（クリックを通過）</strong>または<strong>字幕のロックを解除</strong>。</li>
</ul>
${overlayShot({ slug: "overlay-locked", lang: "ja", alt: "つまみもボタンもない、ロックされた字幕バー。会議の画面の上に翻訳を表示", caption: "ロックされたバー：ボタンがなくすっきりしていて、クリックは通過します。" })}
${callout({ title: "ロックされたバーはクリックできません。", text: "ロックを解除するには、ショートカット、メニューバーのメニュー、またはホーム画面のボタンを使ってください。" })}

<h2 id="show-hide">表示と非表示</h2>
<p>ロックされていないバーにマウスを重ねると、右上の角に <strong>✕</strong> ボタンが表示されます（「字幕を閉じて翻訳を停止」。マウスを重ねると赤くなります）。これを押すと、バーを隠すと同時に翻訳も停止するので、「停止」を別に押す必要はありません。アプリは終了しません。翻訳を続けたままバーだけを隠すには、${keys(["⌃", "⌥", "H"])}、ホーム画面の<strong>非表示</strong>ボタン、またはメニューバーのメニューを使います。同じ方法でバーを元に戻せます。アプリを開いたときバーは隠れていて、「開始」を押すと表示され、「停止」を押すと最後の行を残します。</p>

<h2 id="scroll">前の文にスクロールする</h2>
<p>バーにはセッションの直近 1000 文までが残ります。いちばん下にいるあいだは、新しい文を自動で追いかけます。マウスホイールやトラックパッドで上にスクロールすると（ロックされていないとき）、追いかけるのをやめ、右下の角に <strong>↓ 最新</strong>ボタンが表示されます。押すと現在の文に戻ります。ロック中はマウスが通過するので、${keys(["⌃", "⌥", "PageUp"])} と ${keys(["⌃", "⌥", "PageDown"])} を使います。これらはバーの高さの約 80% ずつスクロールし、このときの「最新」の表示は、前の文を見ていることを知らせるだけです。MacBook のキーボードには Page Up と Page Down の専用キーがないので、使いにくい場合はこの 2 つのショートカットを変更してください。</p>

<h2 id="style">文字サイズ、色、不透明度</h2>
<p><strong>設定 › 字幕</strong>を開きます。上部の<strong>プレビュー</strong>には、設定した文字色、背景、不透明度、文字サイズでサンプルの文が描かれ、スライダーをドラッグしているあいだも更新されます。実際のバーもすぐに変わります。翻訳していないときに実際のバーで確認するには、字幕バーの行の<strong>表示</strong>を押します。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">設定</th><th scope="col">選択肢</th><th scope="col">初期設定</th></tr></thead>
<tbody>
<tr><th scope="row">文字サイズ</th><td>14〜48 px</td><td>20 px</td></tr>
<tr><th scope="row">文字色</th><td>白、黄、緑、水色、オレンジ</td><td>白</td></tr>
<tr><th scope="row">背景色</th><td>黒、ダークグレー、ネイビー、ダークブラウン、ダークパープル</td><td>黒</td></tr>
<tr><th scope="row">背景の不透明度</th><td>0〜100%（0% は透明な背景、100% は不透明）</td><td>60%</td></tr>
<tr><th scope="row">翻訳の上に原文を表示</th><td>オンまたはオフ</td><td>オン</td></tr>
</tbody></table></div>
<div class="grid grid-2">
${appShot({ slug: "app-settings-subtitles", lang: "ja", alt: "字幕の設定：上部にサンプル文のプレビュー、文字サイズのスライダー、2 列の色見本、背景の不透明度のスライダー、原文を表示するスイッチ", caption: "設定 › 字幕。" })}
${overlayShot({ slug: "overlay-custom", lang: "ja", alt: "大きな文字サイズで、紺色の背景に黄色の文字を表示した字幕バー", caption: "例：黄色の文字、紺色の背景、大きめの文字。" })}
</div>

<h2 id="speakers">誰が話しているか：色と名前</h2>
<p>macOS の AI Translator 0.3.2 以降では、字幕バーに誰が話しているかを表示できます。どのプランでも初期設定でオンで、<strong>設定 › 字幕 › 話者</strong>でオフにできます。</p>
<ul>
<li><strong>声ごとに色を分けます。</strong>声の区別はこのパソコン上で行い、現れた順に「話者1」「話者2」と表示します。ラベルと色のバーは各発言の最初の行に表示され、同じ人の続く文には色のバーだけが付きます。</li>
<li><strong>Microsoft Teams から実名を取得します。</strong>パソコンにインストールした Teams アプリで会議を翻訳すると、会議ウィンドウから参加者の名前を読み取り、十分に確かな場合だけ名前を表示します。確かでないうちは「話者N」のままにします。間違った名前は一般的なラベルより悪いためです。チャットは読まず、画面も撮影しません。Google Meet と Zoom の名前はまだ取得できません。</li>
<li><strong>自分で直せます。</strong>メインウィンドウの文字起こしでラベルを選ぶと、名前を変更したり、<em>会議の参加者から選ぶ</em>、同じ人の 2 つのラベルを<em>別の話者に統合</em>したりできます。変更は実行中のセッション全体に反映されます。</li>
<li><strong>権限。</strong>名前を読み取るため、macOS は<em>アクセシビリティ</em>の許可を求めます。バーに短い案内（<em>話者の名前を表示するには、アクセシビリティを許可してください</em>）と設定を開くボタンが表示されます。アプリがシステムのダイアログを自動で開くことはありません。アプリの更新後に再度求められることがあります。許可しなくても、色と「話者N」は使えます。</li>
<li><strong>履歴とエクスポート。</strong>ラベルと名前が履歴に保存されるのは、Pro プランで「履歴を保存」をオンにした場合だけです。そのほか、コピー（どのプランでも）とファイルへのエクスポート（Pro のみ）では、ラベルと名前が本文に含まれます。「履歴を保存」がオフでも、コピーした文章やエクスポートしたファイルには名前が入ることがあります（SRT は、話者名を付ける設定を選んだ場合）。</li>
</ul>
<p>制限：声がとても似た 2 人が 1 つのラベルを共有することがあり、複数の人が同時に話すとラベルが間違うことがあります。Windows にはまだ対応していません。Google Meet と Zoom では色と「話者N」は表示されますが、名前はまだ取得できません。</p>

<h2 id="indicators">バーの表示の意味</h2>
<p>バーの右上の角には、点と短いメモが表示されます：</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">表示</th><th scope="col">意味</th></tr></thead>
<tbody>
<tr><th scope="row">小さな緑の点</th><td>音が届いています。音がないと点は薄い白になります。点はセッション中にだけ表示されます</td></tr>
<tr><th scope="row">モデルを読み込み中…</th><td>AI の処理が始まるまでの、セッションの最初の数秒</td></tr>
<tr><th scope="row">処理が追いついていません</th><td>字幕が発話より遅れています</td></tr>
<tr><th scope="row">音声が聞こえません…</th><td>しばらく音がありません。会議の音声が再生されているか確認してください</td></tr>
<tr><th scope="row">翻訳の残り時間が 5 分未満です</th><td>翻訳時間の上限に近づいています</td></tr>
<tr><th scope="row">翻訳の残り時間を使い切りました · … にリセット</th><td>セッションが止まりました。バーに表示された時刻に翻訳時間が戻ります</td></tr>
</tbody></table></div>
<p>薄い色の行は仮の字幕で、話が続くと完成した文に置き換わります。小さな「未翻訳」のタグは、アプリが翻訳できなかった文を示します。</p>

<h2 id="shortcuts">初期設定のショートカット</h2>
<p>ショートカットは、AI Translator が前面のウィンドウでなくても、どのアプリでも使えます。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">操作</th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">翻訳の開始／停止</th><td>${keys(["⌃", "⌥", "T"])}</td><td>${keys(["Ctrl", "Alt", "T"])}</td></tr>
<tr><th scope="row">字幕の表示／非表示</th><td>${keys(["⌃", "⌥", "H"])}</td><td>${keys(["Ctrl", "Alt", "H"])}</td></tr>
<tr><th scope="row">字幕のロック／ロック解除</th><td>${keys(["⌃", "⌥", "L"])}</td><td>${keys(["Ctrl", "Alt", "L"])}</td></tr>
<tr><th scope="row">字幕を上にスクロール（古い文）</th><td>${keys(["⌃", "⌥", "PageUp"])}</td><td>${keys(["Ctrl", "Alt", "PageUp"])}</td></tr>
<tr><th scope="row">字幕を下にスクロール（新しい文）</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
<tr><th scope="row">入力翻訳のボックスを開く／閉じる</th><td>${keys(["⌃", "⌥", "G"])}</td><td>${keys(["Ctrl", "Alt", "G"])}</td></tr>
</tbody></table></div>
<p class="small muted">macOS では、⌃ は Control キー、⌥ は Option キーです（Command ではありません）。</p>
<p>入力翻訳のショートカットは、入力翻訳がオンのとき（設定 › 入力翻訳）だけ使えます。入力ボックスの使い方は<a href="/ja/guide/type-and-translate/">入力翻訳</a>をご覧ください。</p>

<h2 id="change-shortcuts">ショートカットを変更する</h2>
<ol>
<li><strong>設定 › ショートカット</strong>を開きます。</li>
<li>操作の横にある<strong>変更</strong>を押します。</li>
<li>新しいショートカットを押すか、<strong>Esc</strong> でキャンセルします。</li>
</ol>
<p>新しいショートカットには、Ctrl、Alt、Cmd のうち少なくとも 1 つが必要で、Shift だけでは足りません。アプリ自身のショートカットを選ぶと「このショートカットは、別の操作ですでに使われています。」、OS が受け付けない場合は「システムがこのショートカットを拒否しました。他のアプリが使用している可能性があります。」と表示されます。初期設定のキーが Zoom、Teams、Meet のショートカットとぶつかるかどうかは確認していません。ぶつかる場合は、ここでショートカットを変更してください。</p>
${appShot({ slug: "app-settings-hotkeys", lang: "ja", alt: "ショートカットの設定。入力翻訳を開くを含む 6 つの操作と、それぞれの macOS の初期設定のキーの組み合わせ、変更ボタン", caption: "設定 › ショートカット。" })}

<h2 id="menu-bar">メニューバーとトレイのメニュー</h2>
<p>メニューバーの AI Translator のアイコン（音波の入った吹き出し）を使うと、メインウィンドウを開かずにアプリを操作できます。マウスを重ねると、「待機中」や「翻訳中」といった状態が表示されます。</p>
<p>Windows では、アイコン（アプリのカラーのロゴ）はタスクバーの右端のシステムトレイにあり、<strong>^</strong> 矢印の中に隠れていることがあります。アイコンを右クリックすると下のメニューが開き、左クリックするとメインウィンドウが開きます。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">メニュー項目</th><th scope="col">表示されるとき</th></tr></thead>
<tbody>
<tr><th scope="row">翻訳を開始 / 翻訳を停止</th><td>状態に応じて切り替わります</td></tr>
<tr><th scope="row">字幕を表示 / 字幕を非表示</th><td>状態に応じて切り替わります</td></tr>
<tr><th scope="row">字幕をロック（クリックを通過） / 字幕のロックを解除</th><td>状態に応じて切り替わります</td></tr>
<tr><th scope="row">メインウィンドウを開く</th><td>常に</td></tr>
<tr><th scope="row">アップデートを確認…</th><td>常に。「設定 › 一般」を開いてすぐに確認します</td></tr>
<tr><th scope="row">再起動して更新</th><td>更新がダウンロード済みで、アプリが翻訳していないとき</td></tr>
<tr><th scope="row">終了</th><td>常に。実行中のセッションを止めてから完全に終了します</td></tr>
<tr><th scope="row">登録できなかったショートカットがあります</th><td>ショートカットの登録に失敗したときだけ</td></tr>
</tbody></table></div>

<h2 id="closing-the-window">ウィンドウを閉じてもアプリが終了しない理由</h2>
<p>AI Translator は、メインウィンドウを閉じたあともショートカットや実行中のセッションが動き続けるよう、メニューバー（macOS）またはシステムトレイ（Windows）に常駐するように作られています。閉じるボタンはウィンドウを隠すだけです。Mac では ⌘Q でも終了しません。アプリは「AI Translator はメニューバーで動作し続けます。終了するには、メニューバーのアイコンから「終了」を選んでください。」というメモとともにメインウィンドウを再び表示します。完全に終了するには、メニューバーまたはシステムトレイのアイコンから<strong>終了</strong>を選んでください。</p>
<p>うまく動きませんか？<a href="/ja/guide/troubleshooting/">トラブルシューティング</a>をご覧ください。全体の紹介は<a href="/ja/features/">機能</a>のページにあります。</p>

${docNav(
  [
    { href: "/ja/guide/macos-audio-permission/", kicker: "前へ", title: "macOS でシステムオーディオの録音を許可する" },
    { href: "/ja/guide/type-and-translate/", kicker: "次へ", title: "入力翻訳" },
    { href: "/ja/guide/troubleshooting/", kicker: "関連", title: "トラブルシューティング" },
  ],
  "関連するガイド",
)}
`,
})}
</div></section>
`,
};
