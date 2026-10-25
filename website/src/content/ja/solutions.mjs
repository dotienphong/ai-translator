import { pageHero, sectionHead, feature, linkCard, checkList, callout, ctaBand, facts } from "../../build/components.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ソリューション", path: "/ja/solutions/" },
];

export default {
  id: "solutions",
  lang: "ja",
  path: "/ja/solutions/",
  title: "会議・ライブ配信・動画のための AI Translator",
  description:
    "AI Translator は Zoom、Teams、Meet、Zalo の通話、ライブ配信、ウェビナー、動画に翻訳字幕を表示します。使い方と、向いていない場面をご紹介します。",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  body: () => `
${pageHero({ crumbs, title: "AI Translator は何に使えますか？", lead: "AI Translator は、パソコンで再生されるあらゆる音声にリアルタイムの翻訳字幕を表示し、音声認識も翻訳もあなた自身のマシンで動きます。主な使い方は、オンライン会議、ライブ配信の視聴、そしてわからない言語のウェビナー、講座、動画を見ることです。このページでは、あなたに合った設定を選ぶお手伝いをし、アプリが向いていない場面もお伝えします。" })}

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "主な使い方", title: "いちばん近い場面を選んでください", center: true })}
<div class="grid grid-2">
${linkCard({ href: "/ja/solutions/online-meeting-translation/", icon: "users", title: "オンライン会議：Zoom、Teams、Meet、Zalo", text: "海外の取引先との通話に翻訳字幕を。ボットは不要で、主催者に何かを有効にしてもらう必要もありません。通話前の準備、通話中のショートカット、通話後の文字起こしまで説明します。", more: "会議のソリューションを見る" })}
${linkCard({ href: "/ja/solutions/webinar-and-video-translation/", icon: "play", title: "ウェビナー、講座、動画", text: "ほかの言語のカンファレンスの講演、講座、動画を、何時間にもわたるセッションでも翻訳字幕を読みながら視聴し、あとで文字起こしをコピーしたり書き出したりして復習できます。", more: "ウェビナーと動画のソリューションを見る" })}
${linkCard({ href: "/ja/solutions/livestream-translation/", icon: "video", title: "パソコンで見るライブ配信", text: "英語、中国語、日本語、韓国語のライブ配信をパソコンで見ながら翻訳字幕を表示。ブラウザーに何かをインストールする必要はありません。正直な限界：スマホでは使えず、ご自身のライブ配信の翻訳もできません。", more: "ライブ配信のソリューションを見る" })}
${linkCard({ href: "/ja/solutions/tiktok-live-translation/", icon: "laptop", title: "TikTok ライブ", text: "パソコンのブラウザーで TikTok ライブを翻訳字幕付きで見る方法と、TikTok ライブならではの限界。", more: "TikTok ライブのガイドを見る" })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "共通する点", title: "どの場面でも変わらないこと", text: "会議中でも動画を見ているときでも、AI Translator は同じように動きます。", center: true })}
<div class="grid grid-2">
${feature({ icon: "speaker", title: "システムの音声を聞き取る", text: "アプリはパソコンで再生されている音を取り込むので、音が出るどのアプリやウェブページでも使えます。ボットもプラグインも、会議や動画のプラットフォームのアカウントも不要です。" })}
${feature({ icon: "wifi-off", title: "翻訳中はオフライン", text: "音声認識と翻訳はあなたのマシン上で動きます。音声はメモリ上にとどまり、ディスクに書き込まれず、どこにも送られません。<a href=\"/ja/data-security/\">データとセキュリティ</a>をご覧ください。" })}
${feature({ icon: "languages", title: "5 つの言語", text: "英語、中国語、日本語、韓国語、ベトナム語に、話される音声と翻訳の両方で対応しています。読みたい言語を選べます。" })}
${feature({ icon: "captions", title: "フローティング字幕バー", text: "常に最前面に表示され、使っているアプリからフォーカスを奪わないバーが 1 本。ドラッグで動かし、文字の大きさを変え、ロックしてマウスを通過させることもできます。<a href=\"/ja/features/\">すべての機能</a>をご覧ください。" })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "始める前に", title: "必要なもの", center: true })}
<div class="reveal">${facts([
  ["プラットフォーム", "macOS 14.2 以降（Apple シリコン）と Windows 10/11 x64<small>Intel Mac と Windows ARM64：非対応</small>"],
  ["パソコン", "RAM 8 GB 以上、16 GB 推奨<small>1 回だけのモデルのダウンロード：1.3 GB（Lite）または 2.5 GB（Standard）</small>"],
  ["言語", "英語、中国語、日本語、韓国語、ベトナム語<small>アプリの表示言語：英語、ベトナム語、日本語、中国語（簡体字）、韓国語</small>"],
  ["料金", "10 日間の無料お試し · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>VietQR または国際カード（USD）で前払い、自動更新なし。Creem の一覧により、一部の国ではカードが使えません。</small>"],
])}</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "早見表", title: "どの場面に、どの設定？" })}
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">場面</th><th scope="col">ひとことアドバイス</th></tr></thead>
<tbody>
<tr><th scope="row">取引先との Zoom、Teams、Meet の通話</th><td>音声の言語を固定し、固有名詞を用語集に追加し（Pro）、字幕バーを映像のすぐ下に置く</td></tr>
<tr><th scope="row">Zalo PC の通話</th><td>「自動検出」のままにするか、わかっていれば言語を固定する</td></tr>
<tr><th scope="row">ライブ配信や TikTok ライブ</th><td>パソコンのブラウザーで視聴し、ブラウザーの音だけを聞き取り（macOS）、文が細切れになるなら文を区切る間の長さを長くする。スマホには非対応</td></tr>
<tr><th scope="row">ウェビナーやカンファレンスの講演</th><td>原文の表示を残し（初期設定でオン）、プレーヤーの音だけを聞き取る（macOS）</td></tr>
<tr><th scope="row">講座や講義の動画</th><td>文字起こしを書き出して復習し（Pro）、分野の用語を用語集に追加する（Pro）</td></tr>
</tbody></table></div>
</div></section>

<section class="section section-alt" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "正直な限界", title: "AI Translator が向いていない場面", text: "限界を先に知っておけば、実りのないお試しをせずに済みます。" })}
${checkList([
  "<strong>翻訳したあなたの声を相手に聞かせる必要がある。</strong>AI Translator の字幕は一方向だけで、パソコンで再生されている音声をあなたの言語に翻訳します。あなたの声を翻訳して会議に流すことはしません。文字での返信には<a href=\"/ja/guide/type-and-translate/\">入力翻訳</a>を使えます。",
  "<strong>会議を録音する必要がある。</strong>アプリは音声をディスクに録音しません。残すのは文字起こしのテキストだけで、履歴の保存は初期設定でオフの Pro 機能です。",
  "<strong>議事録の自動作成、要約、話者の区別が必要。</strong>対応していません。",
  "<strong>Intel Mac、Windows ARM64、または CPU が AVX2 に対応していない Windows PC を使っている。</strong>AI Translator は macOS 14.2 以降（Apple シリコン）と、AVX2 対応 CPU を搭載した Windows 10/11 64 ビット（x64）で動きます。",
  "<strong>パソコンの RAM が 8 GB 未満、</strong>または上の 5 言語以外の言語が必要：今のところアプリでは対応できません。",
  "<strong>ベトナムの銀行口座がなく、Creem がカード決済を受け付けない国にいる。</strong>国際カードは Creem を通じて決済されますが、Creem は一部の国の購入者を受け付けておらず（Creem の一覧による）、PayPal もありません。この場合、今のところ有料プランを支払う方法はありません。Free お試しは使えます。",
  "<strong>ライブ配信をスマホで見ている、またはご自身のライブ配信を視聴者向けに翻訳したい。</strong>AI Translator はスマホでは動かず、あなたのライブ配信に字幕や翻訳した音声を追加することもありません。<a href=\"/ja/solutions/livestream-translation/\">ライブ配信の翻訳</a>をご覧ください。",
], true)}
${callout({ kind: "warn", title: "自動翻訳は間違えることがあります。", text: "重要な判断（契約、医療、法律、金融）では、専門家に確認せずに AI Translator に頼らないでください。" })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "続けて読む", title: "もっと詳しく知りたいですか？", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ja/compare/offline-vs-cloud-translation/", icon: "layers", title: "オフライン翻訳とクラウド翻訳", text: "プライバシー、コスト、遅延、ハードウェア、どちらを選ぶべきかを公平に比較。", more: "比較を読む" })}
${linkCard({ href: "/ja/guide/quick-start/", icon: "zap", title: "クイックスタート", text: "インストールから最初の字幕まで。macOS の録音の許可も含みます。", more: "ガイドを開く" })}
${linkCard({ href: "/ja/pricing/", icon: "wallet", title: "料金", text: "10 日間の無料お試し、Monthly 50,000 ₫、6 Months 269,000 ₫、Yearly 500,000 ₫。", more: "料金を見る" })}
</div>
</div></section>

${ctaBand({ title: "ご自身の通話や動画で試してみてください", text: "まずは 10 日間の無料お試しから。1 日 30 分まで、カードもアカウントも不要です。", primary: { href: "/ja/download/", label: "ダウンロード" }, secondary: { href: "/ja/pricing/", label: "料金を見る" } })}
`,
};
