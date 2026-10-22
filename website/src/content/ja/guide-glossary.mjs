import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ガイド", path: "/ja/guide/" },
  { name: "用語集を使う", path: "/ja/guide/glossary/" },
];

const toc = [
  { level: 2, id: "how-it-works", text: "用語集のしくみ" },
  { level: 2, id: "add-edit-delete", text: "用語の追加、編集、削除" },
  { level: 2, id: "import-export-csv", text: "CSV のインポートとエクスポート" },
  { level: 2, id: "writing-tips", text: "よい用語の書き方" },
  { level: 2, id: "examples", text: "例" },
];

export default {
  id: "guide-glossary",
  lang: "ja",
  path: "/ja/guide/glossary/",
  title: "用語集の使い方：追加、CSV、書き方",
  description:
    "AI Translator の用語集（Pro 機能）の使い方：用語の追加・編集・削除、CSV のインポートとエクスポート、用語が翻訳に渡されるしくみ、よい用語の書き方。",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "AI Translator の用語集に用語を追加する",
      description: "用語とその翻訳を 1 つ追加し、さらに CSV ファイルから用語をインポートします。",
      totalTime: "PT5M",
      steps: [
        { name: "用語集を開く", text: "メインウィンドウの左のサイドバーで「用語集」を押します。用語集には有料プラン（Monthly、6 Months、Yearly）が必要です。" },
        { name: "用語とその翻訳を入力する", text: "「用語」の欄に用語を、「翻訳」の欄に希望する翻訳を入力します。どちらの欄も 200 文字までです。" },
        { name: "「追加」を押す", text: "新しい組が一覧に表示されます。セッション中でも、以後の文ですぐに使われます。" },
        { name: "CSV ファイルをインポートする（任意）", text: "「CSV をインポート…」を押し、2 列で UTF-8、1 MB 以下の CSV ファイルを選びます。アプリは追加、更新、スキップ、上限超過になった用語の数を表示します。" },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "用語集を使う",
  lead: "AI Translator の用語集には、名前、略語、業界用語などの「用語 → 翻訳」の組を 500 件まで保存できます。翻訳している文にあなたの用語が含まれていると、アプリはその組をヒントとして翻訳に渡します。用語集は Pro 機能で、Monthly、6 Months、Yearly の各プランに含まれます。",
  meta: `<span><span class="badge badge-pro">Pro</span></span><span>更新日 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "このページの内容",
  body: `
${facts([
  ["プラン", "Pro：Monthly、6 Months、Yearly<small>Free ではロックされた画面が表示されます</small>"],
  ["容量", "最大 500 語<small>各欄 200 文字まで</small>"],
  ["CSV ファイル", "2 列、UTF-8<small>1 MB まで</small>"],
  ["翻訳中", "1 文につき最大 20 語"],
  ["照合", "大文字と小文字を区別しません<small>中国語、日本語、韓国語の用語は単語の途中でも一致します</small>"],
  ["保存場所", "あなたのパソコン<small>暗号化されたデータベースに保存</small>"],
])}

<h2 id="how-it-works">用語集はどのように動きますか？</h2>
<p>文が認識されるたびに、アプリは<strong>原文</strong>（音声認識が書き起こしたテキスト）からあなたの用語を探し、見つかった組をその文とともに翻訳に渡します。セッション中に用語集を編集すると、以後の文ではすぐに新しい内容が使われます。</p>
<ul>
<li><strong>命令ではなくヒントです。</strong>アプリは「毎回使われるとは限りません」と明記しています。用語集は正しい語が使われる可能性を高めますが、保証するものではありません。</li>
<li><strong>大文字と小文字は区別しません：</strong>「api」は「API」と一致します。</li>
<li><strong>ラテン文字の用語は単語単位で一致します：</strong>「AI」は「AI’s」には一致しますが、「said」には一致しません。</li>
<li><strong>中国語、日本語、韓国語の用語は単語の途中でも一致します。</strong>中国語と日本語には単語のあいだにスペースがなく、韓国語は単語に助詞が付くためです。</li>
<li><strong>1 文につき最大 20 語。</strong>それより多く一致した場合は、長くて具体的な用語を優先します。</li>
</ul>
${callout({
  title: "Free プランでは用語集を使えません。",
  text: "用語集の画面には、「用語集は Pro 機能です。登録した用語は翻訳時に使われます。」と書かれたロックされたパネルと、<strong>Pro にアップグレード</strong>ボタンが表示されます。プランの購入については<a href=\"/ja/guide/buy-and-activate/\">プランの購入、キーの有効化、パソコンの変更</a>をご覧ください。価格は<a href=\"/ja/pricing/\">料金ページ</a>にあります。",
})}

<h2 id="add-edit-delete">用語の追加、編集、削除</h2>
<ol>
<li>左のサイドバーで<strong>用語集</strong>を押します。上部のヒントの下に、「8 / 500 語」のように登録している用語の数が表示されます。</li>
<li><strong>用語</strong>の欄に元のテキストを話し手が言うとおりに入力し、<strong>翻訳</strong>の欄に表示してほしい翻訳を入力します。どちらの欄も 200 文字までで、改行やタブは使えません。</li>
<li><strong>追加</strong>を押します。新しい組が「用語 → 翻訳」として一覧に表示されます。</li>
<li>組を変更するには<strong>編集</strong>を押し、2 つの欄を直してから<strong>保存</strong>（または<strong>キャンセル</strong>）を押します。削除するには<strong>削除</strong>を押します。</li>
</ol>
<p>エラーは入力行のすぐ下に表示されます：「用語とその翻訳の両方を入力してください。」、「200 文字以内で入力してください。」、「この用語はすでに用語集にあります。」（重複は大文字と小文字を区別せずに判定します）。用語集が 500 語になると入力行が消え、「用語集にはすでに 500 語あります。追加する前に、いくつか削除してください。」と表示されます。</p>
${appShot({
  slug: "app-glossary",
  lang: "ja",
  alt: "用語集の画面：最大 500 語のうちの用語の数、用語と翻訳の欄、CSV をインポート・CSV をエクスポートのボタン、用語と翻訳の組の一覧",
  caption: "有料プラン（Monthly、6 Months、Yearly）での用語集の画面。",
})}

<h2 id="import-export-csv">CSV のインポートとエクスポート</h2>
<p>インポートすると長い一覧を一度に読み込めます。エクスポートすると、バックアップや表計算ソフトで編集するためのファイルが得られます。ファイルは次の条件を満たす必要があります。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">条件</th><th scope="col">詳細</th></tr></thead>
<tbody>
<tr><th scope="row">列</th><td>1 列目が用語、2 列目が翻訳です。1 行目の <code>source,target</code> は任意で、インポート時には読み飛ばされます。</td></tr>
<tr><th scope="row">文字コード</th><td>UTF-8。表計算ソフトがほかの文字コードで保存すると、アプリはファイルを受け付けません。Excel では「CSV UTF-8」で保存してください。</td></tr>
<tr><th scope="row">サイズ</th><td>1 MB まで。</td></tr>
<tr><th scope="row">各セル</th><td>200 文字まで、改行なし。</td></tr>
</tbody></table></div>
<p>ファイルの内容の例：<br><code>source,target</code><br><code>API gateway,API ゲートウェイ</code><br><code>burn rate,資金燃焼率</code></p>
<ol>
<li><strong>CSV をインポート…</strong>を押し、システムのダイアログでファイルを選びます。</li>
<li>結果を確認します：「インポート結果：追加 … 件、更新 … 件、スキップ … 行、500 語の上限超過 … 件。」</li>
</ol>
<ul>
<li><strong>追加：</strong>新しい用語。</li>
<li><strong>更新：</strong>すでに用語集にある用語（大文字と小文字は区別しません）。アプリはファイルの翻訳を使います。</li>
<li><strong>スキップ：</strong>列が足りない行、空の行、200 文字を超えるセルや改行を含むセル。</li>
<li><strong>500 語の上限超過：</strong>用語集がいっぱいで入りきらなかった有効な行。</li>
</ul>
<p>ファイルを読み取れない場合、アプリは「この CSV ファイルを読み取れませんでした。何もインポートされていません。」と表示し、用語集は変更しません。1 MB を超えるファイルは「このファイルは大きすぎます。用語集ファイルは最大 1 MB です。」と表示して受け付けません。</p>
<p><strong>CSV をエクスポート…</strong>を押すと、用語集全体をファイルに保存します（用語集が空のあいだはボタンを押せません）。エクスポートしたファイルは <code>source,target</code> で始まり、Excel でアクセント記号付きの文字なども正しく表示されるよう UTF-8 を使います。<code>=</code>、<code>+</code>、<code>-</code>、<code>@</code> で始まるセルには、表計算ソフトが数式として扱わないよう先頭にアポストロフィが付きます。そのファイルをもう一度インポートすると、アプリはそのアポストロフィを取り除きます。</p>

<h2 id="writing-tips">よい用語はどう書けばよいですか？</h2>
<ul>
<li><strong>名前：</strong>会社、製品、人、場所。表示してほしい翻訳を書きます。名前をそのまま残してもかまいません。</li>
<li><strong>略語：</strong>話し手が使う形を使い、必要なら説明を加えます：「SLA」→「サービス品質保証（SLA）」。</li>
<li><strong>業界用語：</strong>あなたの分野で、翻訳が違う意味に訳しがちな語。</li>
<li><strong>書き起こされるとおりに書く。</strong>短いセッションを試して<a href="/ja/guide/history-and-export/">文字起こし</a>を読んでみてください。ある名前がいつも違う綴りで書き起こされるなら、その綴りも用語として追加できます。</li>
<li><strong>1 つの用語に 1 つの翻訳。</strong>用語集は言語の組み合わせに結び付いていないので、翻訳はあなたが読む言語で書きます。ホーム画面で翻訳先の言語を変えたら、翻訳を見直してください。</li>
<li><strong>短く具体的に。</strong>「会議」や「プロジェクト」のようなとても一般的な語は避けます。多くの文に出てきますが、直す必要があることはまれです。</li>
</ul>

<h2 id="examples">例</h2>
<p>1 列目は方向（話し手の言語 → あなたが読む言語）です。すべての組を 1 つの用語集に入れておけます。アプリが組を使うのは、その用語が翻訳中の文に出てきたときだけです。</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">方向</th><th scope="col">用語</th><th scope="col">翻訳</th></tr></thead>
<tbody>
<tr><td>英語 → 日本語</td><td>API gateway</td><td>API ゲートウェイ</td></tr>
<tr><td>英語 → 日本語</td><td>Acme Holdings</td><td>Acme Holdings（名前はそのまま）</td></tr>
<tr><td>中国語 → 日本語</td><td>增值税</td><td>付加価値税</td></tr>
<tr><td>韓国語 → 日本語</td><td>회의록</td><td>議事録</td></tr>
<tr><td>日本語 → 英語</td><td>検収報告書</td><td>acceptance report</td></tr>
<tr><td>日本語 → 英語</td><td>大阪</td><td>Osaka</td></tr>
</tbody></table></div>
<p>翻訳された内容を見直すには、<a href="/ja/guide/history-and-export/">文字起こしと履歴</a>を開きます。用語集が思ったとおりに動かない場合は、<a href="/ja/guide/troubleshooting/">トラブルシューティング</a>をご覧ください。</p>
`,
})}
${docNav(
  [
    { href: "/ja/guide/type-and-translate/", kicker: "前へ", title: "入力翻訳" },
    { href: "/ja/guide/history-and-export/", kicker: "次へ", title: "履歴と文字起こしの書き出し" },
  ],
  "関連するガイド",
)}
</div></section>
`,
};
