import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ソリューション", path: "/ja/solutions/" },
  { name: "YouTube 翻訳", path: "/ja/solutions/youtube-translation/" },
];

const FAQ = [
  {
    q: "YouTube動画を日本語に翻訳するには？",
    a: `<p>パソコンに AI Translator をインストールし、ブラウザー（Chrome、Safari、Edge、Firefox）で YouTube 動画を開いて、「翻訳先の言語」で日本語を選び、<strong>開始</strong>を押します。アプリはパソコンで再生されている音声を直接聞き取り、フローティングバーにリアルタイムで翻訳字幕を表示します。動画に投稿者の字幕が用意されていなくても利用できます。</p>`,
  },
  {
    q: "AI Translator は YouTube Live（ライブ配信）も翻訳できますか？",
    a: `<p>はい。アプリはシステム音声を直接取り込むため、YouTube Live などの生配信でも通常の動画と同じように翻訳できます。ブラウザーで再生した動画で動作を確認したほか、YouTube Live（英語のニュースチャンネル、Mac M4 Pro の Chrome、2026年10月25日）でも 1 回試しました。約 4 分間の視聴中、字幕が安定して表示されました。</p>`,
  },
  {
    q: "スマホの YouTube アプリで使えますか？",
    a: `<p>いいえ。AI Translator は macOS（Apple シリコン）と Windows 10/11 x64 専用のデスクトップアプリであり、スマートフォンやタブレットでは使えません。翻訳字幕を表示したい場合は、パソコンのブラウザーで YouTube を開いてください。</p>`,
  },
  {
    q: "ブラウザーに拡張機能やプラグインをインストールする必要はありますか？",
    a: `<p>いいえ。ブラウザーの拡張機能やプラグインは不要で、YouTube アカウントと連携する必要もありません。AI Translator は独立したアプリとして、パソコン上で安全に音声を取り込みます。</p>`,
  },
  {
    q: "AI Translator での YouTube 翻訳は無料ですか？",
    a: `<p>Free プランは 10 日間の無料体験で、1 日最大 30 分まで翻訳できます（Google ログインが必要、クレジットカード不要）。体験期間後は、<a href="/ja/pricing/">料金プラン</a>から Monthly、6 Months、Yearly などの前払いプランをご利用いただけます。</p>`,
  },
];

export default {
  id: "solutions-youtube",
  lang: "ja",
  path: "/ja/solutions/youtube-translation/",
  title: "YouTube 翻訳：動画とライブ配信の字幕",
  description:
    "パソコン上でYouTube動画やライブ配信の音声をリアルタイムで翻訳字幕に。端末内AIで動作し、ブラウザー拡張機能は不要です。10日間の無料体験。",
  type: "article",
  published: "2026-11-09",
  breadcrumbs: crumbs,
  modified: "2026-11-09",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "YouTube 翻訳：動画とライブ配信にリアルタイム字幕",
  lead: "海外の講義動画や技術カンファレンス、YouTube Live を日本語の字幕なしで見ていませんか？ AI Translator はパソコンで再生されている音声をリアルタイムで聞き取り、フローティングバーに翻訳字幕を表示します。AI は端末内（オフライン）で動作し、ブラウザー拡張機能は不要、動画ファイルをアップロードすることなくプライバシーを完全に守ります。",
  meta: "<span>更新日 {{updated}}</span><span>macOS と Windows のパソコンで動作、スマホには非対応</span>",
})}

<section class="section-tight"><div class="container narrow">
${callout({ kind: "warn", title: "お使いになる前に：パソコン専用です。", text: "AI Translator は macOS と Windows 向けに作られており、スマートフォンでは動作しません。翻訳字幕を表示するには、パソコンのブラウザーで YouTube の動画やライブ配信を開いてください。" })}
</div></section>

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["対応環境", "パソコンのブラウザーで再生される YouTube 動画とライブ配信<small>Chrome、Safari、Edge、Firefox など</small>"],
  ["対応言語", "英語、中国語、日本語、韓国語、ベトナム語<small>全方向に対応し、翻訳精度のベンチマークを測定済み</small>"],
  ["遅延", "中央値 0.76〜1.03秒<small>発言終了後。Mac M4 Pro、Standard パックでの測定値</small>"],
  ["処理方式", "完全オンデバイス（ローカル AI）処理<small>音声データが外部に送信されることはなく、拡張機能も不要です</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "活用シーン", title: "日本語字幕がない YouTube 動画の視聴に", center: true })}
<div class="grid grid-3">
${feature({ icon: "book", title: "専門講義・チュートリアル動画", text: "英語や中国語、韓国語によるプログラミング、AI、理工系の学術講義動画を、日本語字幕でスムーズに理解できます。" })}
${feature({ icon: "users", title: "海外ニュース・ポッドキャスト", text: "国際情勢のニュース番組や有識者インタビュー、数時間に及ぶポッドキャストをリアルタイム字幕で追うことができます。" })}
${feature({ icon: "play", title: "YouTube Live の生配信", text: "新製品発表会や国際カンファレンスなどのライブ配信を、配信中の発言に合わせて即座に日本語で把握できます。" })}
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "機能比較", title: "YouTube 標準の自動字幕と何が違うのか？" })}
<p>YouTube にも自動字幕機能がありますが、日本語への自動翻訳に対応していない動画も多く、生配信では利用できなかったり大きな遅延が発生したりします。AI Translator による YouTube 翻訳には以下のメリットがあります：</p>
${checkList([
  "<strong>あらゆる動画で動作：</strong> 投稿者が字幕を登録しているかどうかにかかわらず、パソコンから流れる音声をもとに直接翻訳します。",
  "<strong>YouTube Live（生配信）にも対応：</strong> YouTube 標準機能では制限されがちな生配信でも、リアルタイムに翻訳字幕を生成します。",
  "<strong>自由度の高いフローティング字幕バー：</strong> 画面上の見やすい位置へ自由に配置でき、文字サイズ（14〜48 px）や文字色、背景の透明度を細かく調整できます。",
  "<strong>原文と訳文の2段表示：</strong> 小さな原文の下に大きな日本語訳を表示できるため、専門用語の確認や語学学習にも最適です。",
])}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "使い方", title: "YouTube を翻訳字幕付きで見る 4 つのステップ" })}
${steps([
  { title: "AI Translator をインストールして開く", text: "<a href=\"/ja/download/\">ダウンロード</a>ページにあるコマンドをターミナル（macOS）または PowerShell（Windows）に貼り付けてインストールします。<em>翻訳先の言語</em>で日本語を選びます。" },
  { title: "YouTube の動画やライブ配信を開く", text: "パソコンのブラウザー（Chrome、Edge、Safari、Firefox）で YouTube を開き、動画またはライブ配信を再生して音声を出します。" },
  { title: "「開始」を押す", text: "<strong>開始</strong>を押します（ショートカット ⌃⌥T、Windows：Ctrl+Alt+T）。macOS では初回に<em>システムオーディオの録音</em>の許可を求められます（<a href=\"/ja/guide/macos-audio-permission/\">設定方法</a>を参照）。" },
  { title: "字幕バーを見やすい位置に配置する", text: "字幕バーを動画プレイヤーの下部に配置し、「設定 › 字幕」で好みの文字サイズに調整したら、<em>ロック（クリックを通過）</em>をオンにします。" },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "視聴のコツ", title: "YouTube 動画やライブ配信をより快適に楽しむために" })}
${checkList([
  "<strong>ブラウザーの音声のみを取り込む（macOS）：</strong> システム通知音が翻訳されてしまうのを防ぐため、「設定 › 音声」で<em>Google Chrome のみ</em>などのブラウザーを指定してから開始します。",
  "<strong>文の区切り時間を調整する：</strong> ゆっくり話す動画やポーズの多い講演では、「設定」で<em>文を区切る無音時間</em>（50〜800 ms）を長めに設定すると、文が細切れにならず自然になります。",
  "<strong>文字起こし履歴の保存・復習：</strong> 長時間の講義を視聴した後は、タイムスタンプ付きの文字起こしをコピーしたり、TXT や SRT 形式で書き出して復習に活用できます（<a href=\"/ja/guide/history-and-export/\">履歴と書き出し</a>を参照）。",
  "<strong>専門用語辞書の登録：</strong> 医療やプログラミングなど専門的な動画を見る場合は、<em>カスタム用語集</em>にあらかじめ単語を登録しておくと翻訳精度が高まります。",
])}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "正直な限界", title: "AI Translator が適さないケースについて", text: "ご期待に添えない用途をあらかじめお伝えし、無駄な試用を防ぎます。" })}
${checkList([
  "<strong>スマートフォンで YouTube を見たい場合。</strong> AI Translator は macOS と Windows 専用であり、スマートフォンでは動作しません。パソコンのブラウザーをご利用ください。",
  "<strong>字幕付き動画ファイルをダウンロードしたい場合。</strong> 動画ファイルをダウンロードしません。また動画ファイルを変更したりディスクに保存したりせず、画面上に字幕を表示しテキストの文字起こしを保存するだけです。",
  "<strong>音声の吹き替えやハードサブの焼き込みが必要な場合。</strong> 吹き替え（音声吹き替え）や動画ファイルへの字幕の焼き込みには対応していません。字幕は独立したシステムオーバーレイとして表示されます。",
  "<strong>対応外の言語で配信されている場合。</strong> 現在対応しているのは英語、中国語、日本語、韓国語、ベトナム語の 5 言語です。その他の言語の翻訳には対応していません。",
  "<strong>パソコンの処理能力が不足している場合。</strong> 発言終了後の遅延（中央値 0.76〜1.03秒）は Mac M4 Pro（Standard パック）で測定した数値です。スペックの低い PC や内蔵 GPU のみ環境では遅延が大きくなります。",
], true)}
${callout({ kind: "warn", title: "自動翻訳には誤りが含まれる可能性があります。", text: "AI による翻訳はリアルタイムな理解を補助するためのものです。専門家の確認なしに、重要な法的・金銭的・医療的判断にそのまま頼ることは避けてください。" })}
<p>ブラウザーで再生した動画で動作を確認したほか、YouTube Live（英語のニュースチャンネル、Mac M4 Pro の Chrome、2026年10月25日）でも 1 回試しました。約 4 分間の視聴中ずっと字幕が安定して表示されました。AI Translator は、パソコン上でのリアルタイムな YouTube 視聴を快適にサポートします。</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "よくある質問", title: "YouTube 翻訳に関する FAQ" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "さらに詳しく", title: "次のステップ", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ja/solutions/webinar-and-video-translation/", icon: "book", title: "ウェビナーと動画", text: "オンライン講座や長時間の録画セミナー動画の翻訳はこちら。", more: "ソリューションを見る" })}
${linkCard({ href: "/ja/solutions/livestream-translation/", icon: "play", title: "ライブ配信の翻訳", text: "各種ライブ配信プラットフォームでのリアルタイム字幕機能。", more: "ソリューションを見る" })}
${linkCard({ href: "/ja/pricing/", icon: "wallet", title: "料金プラン", text: "10日間の無料体験、Monthly、6 Months、Yearly などの前払いプラン。", more: "料金を見る" })}
</div>
<p class="center-text reveal">プライバシーとセキュリティに関する方針については、<a href="/ja/data-security/">データとセキュリティ</a>をご覧ください。</p>
<p class="disclaimer">YouTube は Google LLC の商標です。AI Translator は Google または YouTube と提携していません。</p>
</div></section>

${ctaBand({
  title: "AI Translator で YouTube 翻訳を始めましょう",
  text: "1 行のコマンドで簡単インストール。macOS と Windows で 10 日間の無料体験をお試しください（クレジットカード不要）。",
  primary: { href: "/ja/download/", label: "今すぐダウンロード" },
  secondary: { href: "/ja/pricing/", label: "料金プランを見る" },
})}
`,
};
