import { pageHero, sectionHead, linkCard, callout, facts, icon } from "../../build/components.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ガイド", path: "/ja/guide/" },
];

const MORE = "ガイドを読む";

export default {
  id: "guide",
  lang: "ja",
  path: "/ja/guide/",
  title: "AI Translator の使い方ガイド",
  description:
    "手順ごとの 10 本のガイド：macOS・Windows へのインストール、録音の許可、ショートカット、入力翻訳、用語集、履歴と書き出し、キーの購入、トラブルシューティング。",
  schemaType: "CollectionPage",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator の使い方ガイド",
  lead: "macOS や Windows へのインストールから、キーの購入、問題の解決まで、AI Translator の使い方を手順ごとに説明する 10 本のガイドです。どのガイドもアプリに表示されるとおりのボタン名やメニュー名を使い、ほとんどに実際の画面のスクリーンショットがあります。",
})}

<section class="section-tight"><div class="container">
${callout({ title: "これらのガイドは macOS と Windows の両方に対応しています。", text: "ほとんどの手順はどちらのシステムでも同じです。Windows でのおもな違い：PowerShell のコマンドでインストールします（.exe ファイルも使えますが、Windows 版はまだコード署名されていないため、SmartScreen が警告することがあります）。音声の許可を与える必要はなく、アイコンはメニューバーではなくシステムトレイにあり、ショートカットは ⌃⌥ の代わりに Ctrl+Alt を使います。インストーラーがまだない場合は<a href=\"/ja/download/\">ダウンロードページ</a>をご覧ください。" })}
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "はじめに", title: "インストーラーから最初の字幕まで" })}
<div class="grid grid-2">
${linkCard({ href: "/ja/guide/quick-start/", icon: "play", title: "クイックスタート", text: "最初に一度だけ行う 7 つの設定の手順と、最初の会議の翻訳。アプリの設定画面のスクリーンショット付き。", more: MORE })}
${linkCard({ href: "/ja/guide/install-macos/", icon: "download", title: "macOS にインストール", text: "コマンド 1 つでインストール、または .dmg から（アプリケーションにドラッグ、このまま開く）。SHA-256 の確認とアンインストール。", more: MORE })}
${linkCard({ href: "/ja/guide/install-windows/", icon: "download", title: "Windows にインストール", text: "PowerShell のコマンド 1 つでインストール、または .exe から（SHA-256、SmartScreen）。スマート アプリ コントロールとアンインストール。", more: MORE })}
${linkCard({ href: "/ja/guide/macos-audio-permission/", icon: "mic", title: "音声の許可（macOS）", text: "システムオーディオの録音の確認に答え、システム設定でオンに戻し、音声ソースを選びます。", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "毎日の使い方", title: "字幕バー、入力翻訳、用語集、文字起こしを使いこなす" })}
<div class="grid grid-2">
${linkCard({ href: "/ja/guide/subtitle-bar-and-shortcuts/", icon: "captions", title: "字幕バーとショートカット", text: "バーの移動、ロック、非表示、スクロール、文字の大きさと色の変更、ショートカットの一覧、メニューバーのメニュー。", more: MORE })}
${linkCard({ href: "/ja/guide/type-and-translate/", icon: "message", title: "入力翻訳", text: "使っているチャット欄で ⌃⌥G（Ctrl+Alt+G）を押し、自分の言語で入力して Enter を押すと翻訳が貼り付けられます。macOS ではアクセシビリティの許可が必要です。", more: MORE })}
${linkCard({ href: "/ja/guide/glossary/", icon: "book", title: "用語集を使う", text: "名前や用語の追加、CSV の読み込みと書き出し。用語集が保証ではなく、翻訳へのヒントである理由。", more: MORE })}
${linkCard({ href: "/ja/guide/history-and-export/", icon: "history", title: "履歴と文字起こしの書き出し", text: "履歴の保存をオンにし、過去のセッションを見直し、文字起こしをコピーして TXT、SRT、Markdown に書き出します。", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "プランとサポート", title: "プラン、キー、困ったときは" })}
<div class="grid grid-2">
${linkCard({ href: "/ja/guide/buy-and-activate/", icon: "key", title: "プランの購入、キーの有効化、パソコンの変更", text: "アプリ内で VietQR または国際カードで Monthly、6 Months、Yearly を購入し、キーを入力、パソコンを変更、更新、なくしたキーを取り戻します。", more: MORE })}
${linkCard({ href: "/ja/guide/troubleshooting/", icon: "support", title: "トラブルシューティング", text: "字幕が出ない、翻訳時間を使い切った、キーがロックされた、モデルのダウンロードに失敗した：それぞれの原因と直し方。", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container narrow">
${sectionHead({ title: "状況からガイドを探す" })}
${facts([
  ["初回起動時に macOS がアプリをブロックする", "<a href=\"/ja/guide/install-macos/\">macOS へのインストール</a>の「初回起動」の節をご覧ください"],
  ["Windows に「Windows によって PC が保護されました」と表示される", "<a href=\"/ja/guide/install-windows/\">Windows へのインストール</a>の「インストーラーを実行する」の節をご覧ください"],
  ["「開始」を押しても何も表示されない", "<a href=\"/ja/guide/macos-audio-permission/\">音声の許可</a>、次に<a href=\"/ja/guide/troubleshooting/\">トラブルシューティング</a>をご覧ください"],
  ["字幕バーが消えた、または反応しない", "<a href=\"/ja/guide/subtitle-bar-and-shortcuts/\">字幕バーとショートカット</a>の「表示と非表示」と「ロック」の節をご覧ください"],
  ["文字起こしを保存したい、書き出したい", "<a href=\"/ja/guide/history-and-export/\">履歴と書き出し</a>をご覧ください"],
  ["名前や用語をいつも同じように訳してほしい", "<a href=\"/ja/guide/glossary/\">用語集</a>をご覧ください"],
  ["相手の言語で返信したい", "<a href=\"/ja/guide/type-and-translate/\">入力翻訳</a>をご覧ください"],
  ["パソコンを変えた、またはキーをなくした", "<a href=\"/ja/guide/buy-and-activate/\">キーの購入と有効化</a>をご覧ください"],
])}
</div></section>

<section class="section-tight"><div class="container narrow">
<div class="card reveal">
<h2>お困りですか？</h2>
<p>ガイドで答えが見つかりませんでしたか？<a href="/ja/faq/">よくある質問</a>を読むか、<a href="/ja/contact/">お問い合わせ</a>ページからご連絡ください。<strong>support@aitranslator.vn</strong> にメールをお送りいただけます。</p>
<p class="more-link"><a class="btn btn-secondary" href="/ja/contact/">サポートに連絡する ${icon("arrow-right")}</a> <a class="btn btn-ghost" href="/ja/faq/">よくある質問</a></p>
</div>
</div></section>
`,
};
