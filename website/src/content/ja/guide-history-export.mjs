import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ガイド", path: "/ja/guide/" },
  { name: "履歴と文字起こしの書き出し", path: "/ja/guide/history-and-export/" },
];

const toc = [
  { level: 2, id: "transcript", text: "文字起こしの表示、検索、コピー" },
  { level: 2, id: "save-history", text: "履歴をオンにする" },
  { level: 2, id: "export", text: "TXT、SRT、Markdown に書き出す" },
  { level: 2, id: "delete-data", text: "セッションとデータの削除" },
];

export default {
  id: "guide-history-export",
  lang: "ja",
  path: "/ja/guide/history-and-export/",
  title: "履歴と書き出し：TXT・SRT・Markdown",
  description:
    "文字起こしの表示・検索・コピーはすべてのプランで。暗号化された履歴と TXT・SRT・Markdown への書き出しは Pro。SRT の時間の数え方とデータの削除方法も説明します。",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "AI Translator で履歴をオンにして文字起こしを書き出す",
      description: "履歴をオンにしてセッションを翻訳し、その文字起こしを TXT、SRT、Markdown として書き出します。",
      totalTime: "PT5M",
      steps: [
        { name: "履歴をオンにする", text: "「設定 › プライバシー」を開き、「文字起こしの履歴を保存」をオンにします。有料プラン（Monthly、6 Months、Yearly）が必要です。" },
        { name: "セッションを翻訳して「停止」を押す", text: "「停止」を押すと、アプリはセッションの文字起こしをパソコン上の履歴に暗号化して保存します。" },
        { name: "文字起こしを開く", text: "「文字起こし」を開くか、「履歴」で保存したセッションを「開く」ボタンで開きます。" },
        { name: "形式を選んで書き出す", text: "「書き出し形式」で TXT、SRT、Markdown を選び（SRT の場合は「翻訳」か「原文」を選びます）、「書き出し…」を押して保存先を選びます。" },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "履歴と文字起こしの書き出し",
  lead: "AI Translator の文字起こしには、セッションのすべての文について、時刻、原文、翻訳が並びます。どのプランでも表示、検索、コピーができます。セッションの履歴の保存（あなた自身のパソコンに暗号化して保存）と、TXT、SRT、Markdown への書き出しは Pro 機能で、履歴の保存は初期設定でオフです。",
  meta: `<span><span class="badge badge-pro">Pro</span> 書き出しと履歴</span><span>更新日 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "このページの内容",
  body: `
${facts([
  ["すべてのプラン", "セッションの文字起こしの表示、検索、コピー"],
  ["Pro", "履歴の保存、過去のセッションを開く、TXT・SRT・Markdown への書き出し"],
  ["履歴の保存", "初期設定でオフ<small>「設定 › プライバシー」でオンにします</small>"],
  ["保存場所", "あなたのパソコン、暗号化して保存<small>鍵はキーチェーン（macOS）または資格情報マネージャー（Windows）にあります</small>"],
])}

<h2 id="transcript">文字起こしの表示、検索、コピー</h2>
<p>サイドバーの<strong>文字起こし</strong>を開くか、ホーム画面で<strong>文字起こしを開く</strong>を押します。各行には時刻、原文、翻訳があります。スキップされた区間は「[区間をスキップ]」と表示され、翻訳できなかった文には「未翻訳」の印が付きます。</p>
<ul>
<li><strong>検索：</strong>上部の虫めがねのアイコンの付いた検索欄（プレースホルダーは「原文または翻訳の語句」）に入力します。<strong>すべてコピー</strong>は同じ行の右側にあります。一致するものがない場合は「検索に一致する文がありません。」と表示されます。</li>
<li><strong>すべてコピー：</strong>文字起こし全体をプレーンテキストとして（下の TXT の書き出しと同じレイアウトで）クリップボードに入れ、「クリップボードにコピーしました。」と表示します。</li>
</ul>
${callout({
  kind: "warn",
  title: "文字起こしに残るのは最新のセッションだけです。",
  text: "文字起こしはアプリのメモリにあり、新しいセッションを始めると古いものは置き換わります。残しておくには、次のセッションを始める前にコピーするか、書き出すか、履歴をオンにしてください。字幕バーに残るのは直近の 1000 文だけですが、文字起こしにはセッションのすべての文が残ります。",
})}
${appShot({
  slug: "app-transcript",
  lang: "ja",
  alt: "文字起こしの画面：虫めがねのアイコンの付いた検索欄、すべてコピーボタン、書き出し形式の選択、時刻・原文・翻訳の並んだ行の一覧",
  caption: "文字起こし：検索、コピー、書き出し形式の選択。",
})}

<h2 id="save-history">履歴をオンにする（Pro）</h2>
<ol>
<li><strong>設定 › プライバシー</strong>を開きます。</li>
<li><strong>文字起こしの履歴を保存</strong>をオンにします。Free お試しではスイッチがロックされ、「履歴の保存は Pro 機能です。」と表示されます。</li>
<li>いつもどおり翻訳してから、<strong>停止</strong>を押します。アプリはセッションの文字起こしを保存します。文が 1 つもないセッションは保存されません。セッションの途中でアプリを終了したり、シャットダウンやログアウトをしたりした場合も、「停止」を押したときと同じように保存されますが、強制終了や電源が切れた場合はそのセッションは失われます。</li>
<li>サイドバーの<strong>履歴</strong>を開きます。</li>
</ol>
${appShot({
  slug: "app-settings-privacy",
  lang: "ja",
  alt: "プライバシーの設定：文字起こしの履歴を保存のスイッチ（オフ）、エラーレポートを自動送信のスイッチ（オン）、すべてのデータを削除ボタン、モデルとデータを削除ボタン",
  caption: "設定 › プライバシー：履歴をオンにする、データを削除する。",
})}
<p><strong>履歴</strong>の各セッションには、日時、長さと文の数（「47 分 · 186 文」）、プレビュー、<strong>開く</strong>と<strong>削除</strong>のボタンが、新しい順に表示されます。<strong>開く</strong>を押すと、文字起こしと同じように表示、検索、コピー、書き出しができ、<strong>一覧に戻る</strong>で戻ります。保存がオフの場合、画面には「履歴の保存がオフのため、新しいセッションは保存されません。」と表示されます。</p>
${appShot({
  slug: "app-history",
  lang: "ja",
  alt: "履歴の画面：日時、長さ、文の数、プレビュー、開くと削除のボタンが付いた保存済みのセッション",
  caption: "履歴：パソコンに保存したセッション。",
})}
<p>履歴と用語集は、あなたのパソコンにだけある 1 つの暗号化されたデータベースを共有しています。鍵はアプリがあなたのマシンで作るランダムな値で、キーチェーン（macOS）または資格情報マネージャー（Windows）に保管されます。システムからアクセスを求められたときに拒否すると、アプリは「履歴と用語集のデータを開けませんでした。…」と表示します。許可してからもう一度お試しください。詳しくは<a href="/ja/data-security/">データとセキュリティ</a>をご覧ください。</p>

<h2 id="export">TXT、SRT、Markdown に書き出す（Pro）</h2>
<ol>
<li><strong>文字起こし</strong>を開くか、<strong>履歴</strong>でセッションを開きます。</li>
<li><strong>書き出し形式</strong>で <strong>TXT</strong>、<strong>SRT</strong>、<strong>Markdown</strong> のどれかを選びます。SRT の場合は、ファイルに入れるテキストを選ぶ 2 つ目のメニューが横に表示されます：<strong>翻訳</strong>または<strong>原文</strong>。</li>
<li><strong>書き出し…</strong>を押して保存先を選びます。アプリは <code>transcript-2026-10-02-1405.txt</code> のような名前（セッションを始めた日時）を提案します。終わると「… に保存しました」と表示されます。</li>
</ol>
<p>Free お試しでは<strong>書き出し…</strong>ボタンがロックされ、「ファイルへの書き出しは Pro 機能です。コピーはすべてのプランで使えます。」という注記と<strong>Pro にアップグレード</strong>ボタンが表示されます。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">形式</th><th scope="col">各行の内容と時刻</th></tr></thead>
<tbody>
<tr><th scope="row">TXT</th><td>1 文につき 1 つのまとまり：<code>[時刻] 原文</code>、次の行に <code>→ 翻訳</code>、まとまりのあいだは空行。時刻は、その文が始まったときのパソコンの時計の時刻（HH:MM:SS）です。</td></tr>
<tr><th scope="row">SRT</th><td>番号、「開始 --&gt; 終了」、そして 1 行のテキスト（選んだ翻訳または原文）。時間はセッションの開始から数えます（HH:MM:SS,mmm）。</td></tr>
<tr><th scope="row">Markdown</th><td>開始日時の見出しと、時刻・原文・翻訳の 3 列の表。時刻はパソコンの時計の時刻です。</td></tr>
</tbody></table></div>
<h3>SRT ファイルを動画で使う</h3>
<p>SRT の各行の時間はセッションの開始から数えるので、00:00:00 はセッションの開始であり、自動的に動画の始まりになるわけではありません。AI Translator は会議を録音しないため、動画がいつ始まったかを知ることができません。動画とセッションがずれている場合は、プレーヤーや字幕エディターで時間をずらしてください。「翻訳」の SRT では、翻訳のない文（すでにあなたの言語の文、または翻訳できなかった文）は原文で表示されます。</p>

<h2 id="delete-data">セッションとすべてのデータを削除する</h2>
<ul>
<li><strong>削除</strong>（履歴）：1 つのセッションを削除します。</li>
<li><strong>すべてのセッションを削除：</strong>アプリが「保存したセッションをすべて削除しますか？この操作は元に戻せません。」と尋ねるので、<strong>削除</strong>を押します。</li>
<li><strong>すべてのデータを削除</strong>（設定 › プライバシー、すべてのプラン）：このパソコンから保存した履歴と用語集を削除します。ライセンス、翻訳時間、設定は残ります。アプリは確認を求めてから「履歴と用語集を削除しました。」と表示します。</li>
<li><strong>モデルとデータを削除</strong>（同じ画面）：ダウンロードしたモデルも削除します。macOS では、アプリを削除する前に行ってください。</li>
</ul>
<p>削除は元に戻せません。続きは<a href="/ja/guide/glossary/">用語集のガイド</a>や<a href="/ja/guide/troubleshooting/">トラブルシューティング</a>をご覧ください。</p>
`,
})}
${docNav(
  [
    { href: "/ja/guide/glossary/", kicker: "前へ", title: "用語集を使う" },
    { href: "/ja/guide/buy-and-activate/", kicker: "次へ", title: "プランの購入、キーの有効化、パソコンの変更" },
  ],
  "関連するガイド",
)}
</div></section>
`,
};
