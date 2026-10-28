import { RELEASE } from "../../site.mjs";
import { pageHero, sectionHead, feature, linkCard, callout, facts, ctaBand } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";
import { legalVersionLine } from "../legal.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "AI Translator について", path: "/ja/about/" },
];

const MAIL = `<a href="mailto:${SITE.email}">${SITE.email}</a>`;

export default {
  id: "about",
  lang: "ja",
  path: "/ja/about/",
  title: "AI Translator について：経緯と開発者",
  description:
    "AI Translator は会議のリアルタイム翻訳字幕をオフラインで表示するアプリで、個人開発者の Đỗ Tiến Phong が開発しています。経緯、原則、現在の状況をご紹介します。",
  schemaType: "AboutPage",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator について：自分のパソコンで会議を翻訳する",
  lead: "AI Translator は、会議の音声にリアルタイムの翻訳字幕を表示し、パソコン上でオフラインで動くデスクトップアプリです。個人開発者の Đỗ Tiến Phong が開発・運営しています。macOS と Windows で使えます。",
  meta: "<span>更新日 {{updated}}</span><span>提供者：Đỗ Tiến Phong</span>",
})}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["製品", "会議、ウェビナー、動画のリアルタイム翻訳字幕<small>音声認識と翻訳はパソコン上で動作</small>"],
  ["提供者", "Đỗ Tiến Phong（個人）<small>個人開発者</small>"],
  ["状況", `${RELEASE.ja}<small>macOS 14.2 以降（Apple シリコン）と Windows 10/11 64 ビット</small>`],
  ["サポート", `${MAIL}<small>ベトナム語または英語でお問い合わせいただけます</small>`],
  ["言語", "英語、中国語（中文）、日本語、韓国語（한국어）、ベトナム語（Tiếng Việt）<small>アプリの表示言語は、ベトナム語、英語、日本語、中国語（簡体字）、韓国語</small>"],
  ["ライセンス", "商用製品で、オープンソースではありません<small>サードパーティのオープンソースのコンポーネントを使用</small>"],
])}</div>
</div></section>

<section class="section" id="story"><div class="container narrow">
${sectionHead({ eyebrow: "経緯", title: "AI Translator が生まれた理由" })}
<div class="prose">
<p>最初の構想は、既存の Android 向けオフライン翻訳アプリ（オープンソースのもの）を通話や会議に使うことでした。しかし、すぐに OS の大きな制約にぶつかりました。Android では、サードパーティのアプリがメディアやゲームの音声は取り込めても、電話や VoIP の通話の音声は取り込めず、通話中はアプリのマイクにもたいてい無音しか届きません。</p>
<p>パソコンは違います。Windows も macOS（14.2 以降）も、パソコン自身が再生している音をアプリが取り込む方法を用意しています。そこでプロジェクトはデスクトップに移りました。システムの音声を聞き取り、音声を認識して翻訳し、字幕を表示する、どの会議アプリでもボットやプラグインなしで使えるアプリです。</p>
<p>調査した時点（2026年9月）では、大手の会議アプリの翻訳字幕は上位の有料プランにあってクラウドで動くことが多く、多くのサードパーティのツールも同じでした。私たちは別の選択肢を作りたいと考えました。すべてをパソコン上で処理し、どの会議アプリでも使え、ベトナム語に力を入れ、サーバーで翻訳しないので利用時間ごとにインフラの費用が増えることもない選択肢です。<a href="/ja/compare/offline-vs-cloud-translation/">オフライン翻訳とクラウド翻訳の比較</a>もご覧ください。</p>
<p>翻訳モデルは測定にもとづいて選びました。2026年9月29日の社内テスト（テキスト 320 文、5 つの翻訳方向、Mac M4 Pro で実行）では、選んだモデルは翻訳品質の自動スコアで 0.837 となり、同じ条件でテストしたほかの 3 つの翻訳モデルは 0.736〜0.833 でした。このテストは実際の音声ではなくテキストで行い、クラウドのサービスとは比較していません。</p>
</div>
</div></section>

<section class="section section-alt" id="principles"><div class="container">
${sectionHead({ eyebrow: "原則", title: "製品づくりで守っている 6 つのこと", center: true })}
<div class="grid grid-3">
${feature({ icon: "shield", title: "設計からプライバシー重視", text: "音声は RAM に置かれ、ディスクに書き込まれることもどこかに送られることもありません。サーバーに残すのは、ライセンス、注文、お試し、エラーレポートに必要なものだけです。詳しくは<a href=\"/ja/data-security/\">データとセキュリティ</a>をご覧ください。", accent: true })}
${feature({ icon: "wifi-off", title: "翻訳中はオフライン", text: "音声認識と翻訳はパソコン上で動きます。インターネットが必要なのは、モデルのダウンロード、お試しの登録、ライセンスの購入と確認、アプリの更新のときだけです。" })}
${feature({ icon: "info", title: "状況を正直に伝える", text: "まだできていないことは、まだだと伝えます。macOS はまだ公証を受けておらず、Windows はまだコード署名されておらず、測定していないマシンもあります。ウェブサイトでもアプリでも、そのままお伝えします。" })}
${feature({ icon: "lock", title: "広告なし、アクセス解析なし", text: "アプリには広告もアクセス解析もありません。エラーが起きたときは、問題を直すために個人情報を除いたエラーレポート（音声も会議の内容も含みません）を送ります。設定でオフにできます。私たちの収入は有料プランから得ており、あなたのデータからではありません。" })}
${feature({ icon: "video", title: "ボットなし、アカウントなし", text: "会議にボットが参加することも、インストールするプラグインも、サインインもありません。有料プランはメールで届くライセンスキーで有効にします。" })}
${feature({ icon: "gauge", title: "数値には条件を添える", text: "このウェブサイトの速度や品質の数値には、すべて測定したマシンと条件を添えています。測定していないものは、測定していないとお伝えします。<a href=\"/ja/features/#performance\">機能とパフォーマンス</a>をご覧ください。" })}
</div>
</div></section>

<section class="section" id="who"><div class="container narrow">
${sectionHead({ eyebrow: "開発者", title: "AI Translator を作っているのは誰？" })}
<div class="prose">
<p>AI Translator は、デスクトップアプリからライセンスサーバーまで、個人開発者の <strong>Đỗ Tiến Phong</strong> が開発・運営しています。このウェブサイトでは簡潔さのために「私たち」と書いていますが、一人の開発者による製品です。</p>
<p>ここには長い経歴、利用者の声、顧客のロゴは載せていません。載せているのは、確かめられることだけです：条件付きの測定結果、わかっている制約、明確な規約。ご質問、ご意見、不具合の報告は ${MAIL} までお送りください。<a href="/ja/contact/">お問い合わせページ</a>もご覧ください。</p>
</div>
</div></section>

<section class="section section-alt" id="status"><div class="container narrow">
${sectionHead({ eyebrow: "現在", title: "AI Translator の今の状況" })}
<div class="table-wrap reveal" role="region" aria-label="AI Translator の現在の状況" tabindex="0"><table>
<thead><tr><th scope="col">項目</th><th scope="col">状況</th></tr></thead>
<tbody>
<tr><th scope="row">macOS</th><td>macOS 14.2 以降、Apple シリコン。<a href="/ja/download/#install-macos">ターミナルでコマンド 1 行でインストール</a>。</td></tr>
<tr><th scope="row">Windows</th><td>Windows 10/11 64 ビット（x64）。<a href="/ja/download/#install-windows">PowerShell でコマンド 1 行でインストール</a>。Windows での遅延は内蔵グラフィックスのノートパソコン 1 台で予備テストをしただけです（Mac M4 Pro より遅い）。</td></tr>
<tr><th scope="row">コード署名</th><td>macOS はアドホック署名で、公証を受けていません。コマンドでインストールすれば直接開きますが、ブラウザーでダウンロードした .dmg は初回起動時に「このまま開く」が必要です。Windows はまだコード署名証明書がありません。コマンドでインストールすれば SmartScreen の確認は出ませんが、ブラウザーでダウンロードした .exe は警告が出ることがあります（ブロックモードのスマート アプリ コントロールはどちらもブロックします）（<a href="/ja/guide/install-windows/">対処方法</a>）。</td></tr>
<tr><th scope="row">お支払い</th><td>PayOS 経由の VND での VietQR、または Creem 経由の USD での国際カード。VietQR の注文にはまだベトナムの電子インボイスがなく、カードの注文には Creem から領収書が届きます。</td></tr>
<tr><th scope="row">プラン</th><td>10 日間の無料お試し、Monthly、6 Months、Yearly。<a href="/ja/pricing/">料金</a>をご覧ください。</td></tr>
</tbody></table></div>
</div></section>

<section class="section" id="under-consideration"><div class="container narrow">
${sectionHead({ eyebrow: "これから", title: "検討していること" })}
${callout({ kind: "warn", title: "これはお約束ではありません。", text: "以下は、次の段階に向けて検討しているものです。日程も決まった順番もなく、利用者のご意見によって変わったり、取りやめたりすることがあります。" })}
<div class="prose">
<ul>
<li>Google Meet と Zoom から話者名を表示し、Windows でも話者を区別する</li>
<li>Windows ARM64 への対応</li>
<li>Windows でのアプリごとの音声取り込み</li>
<li>双方向の音声翻訳（あなた自身の声を会議のほかの参加者に向けて翻訳）</li>
<li>会議の要約と議事録</li>
<li>複数のデバイス向けのビジネスプラン</li>
<li>話される音声と翻訳の言語の追加（現在の 5 言語以外）</li>
<li>表示言語の追加</li>
</ul>
<p>順番は利用者のご意見で決まります。いちばん必要なものを<a href="/ja/contact/">お問い合わせページ</a>からお知らせください。</p>
</div>
</div></section>

<section class="section section-alt" id="technology"><div class="container narrow">
${sectionHead({ eyebrow: "ライセンス", title: "サードパーティのオープンソースのコンポーネント", text: "AI Translator は商用製品で、オープンソースではありません。使用許諾契約では、複製、リバースエンジニアリング、ブランドの差し替えを認めていません。ただし、サードパーティの多くのオープンソースのコンポーネントを使っており、そのクレジットを表示しています。" })}
<p class="small muted">元のモデルは改変せず、そのライセンスとともに再配布しています。コンポーネントとライセンスの全一覧はアプリの中の「このアプリについて › オープンソースライセンス」にあります。Zoom、Microsoft Teams、Google Meet、Zalo の名前は互換性の説明のためだけに使っており、AI Translator はこれらの企業と提携していません。</p>
</div></section>

<section class="section" id="legal"><div class="container narrow">
${sectionHead({ eyebrow: "法的情報", title: "簡単な法的情報" })}
<div class="reveal">${facts([
  ["提供者", "Đỗ Tiến Phong（個人）"],
  ["ブランド", "AI Translator"],
  ["準拠法", "ベトナム法<small>紛争はベトナムの管轄裁判所で扱います（利用規約、第 14 条）</small>"],
  ["利用規約", `<a href="/en/terms/">使用許諾契約（EULA、英語）</a><small><span lang="en">${legalVersionLine("eula.en.md")}</span></small>`],
  ["プライバシー", `<a href="/en/privacy/">プライバシーポリシー（英語）</a><small><span lang="en">${legalVersionLine("privacy.en.md")}</span></small>`],
  ["文書の言語", "ベトナム語版が原文で、優先されます<small>英語版は参考のための翻訳です。日本語版はありません</small>"],
  ["個人データに関するお問い合わせ", MAIL],
])}</div>
</div></section>

<section class="section-tight"><div class="container">
<h2 class="sr-only">続けて読む</h2>
<div class="grid grid-3">
${linkCard({ href: "/ja/features/", icon: "captions", title: "機能", text: "AI Translator が今できることを、アプリでの実際の動きそのままに。", more: "機能を見る" })}
${linkCard({ href: "/ja/data-security/", icon: "shield", title: "データとセキュリティ", text: "パソコンに残るもの、アプリの接続先、サーバーに保存するもの。", more: "詳しく読む" })}
${linkCard({ href: "/ja/pricing/", icon: "wallet", title: "料金", text: "10 日間の無料お試し、Monthly 50,000 ₫、6 Months 269,000 ₫、Yearly 500,000 ₫。", more: "料金を見る" })}
</div>
</div></section>

${ctaBand({ title: "実際の会議で試してみてください", text: "macOS や Windows にコマンド 1 行でインストールし、10 日間の Free お試しをお使いください。カードもアカウントも不要です。", primary: { href: "/ja/download/", label: "ダウンロード" }, secondary: { href: "/ja/contact/", label: "お問い合わせ" } })}
`,
};
