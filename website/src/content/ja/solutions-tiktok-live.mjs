import { pageHero, sectionHead, checkList, callout, ctaBand, steps, linkCard, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ソリューション", path: "/ja/solutions/" },
  { name: "TikTok ライブの翻訳", path: "/ja/solutions/tiktok-live-translation/" },
];

const FAQ = [
  {
    q: "TikTok ライブを自分の言語に翻訳できますか？",
    a: `<p>仕組みのうえではできます。アプリはパソコンで再生されている音声を聞き取るのでウェブサイトに左右されず、英語、中国語、日本語、韓国語、ベトナム語で話す人の言葉を、この 5 つのうちほかの言語の字幕にできます。ただし TikTok ライブについては、BGM が流れるベトナム語のライブ配信 1 件の結果しかありません。アプリは音声を取り込めましたが、BGM の影響で認識を誤ったため、字幕は実用になりませんでした。英語、中国語、日本語、韓国語の TikTok ライブでの結果はありません。ブラウザーで再生した動画で動作を確認したほか、YouTube Live（英語のニュースチャンネル、macOS の Chrome、2026年10月25日）でも 1 回試しました。手順：ブラウザーでライブ配信を開き、AI Translator で「開始」を押して、フローティングバーの翻訳字幕を読みます。</p>`,
  },
  {
    q: "スマホで使えますか？",
    a: `<p>いいえ。AI Translator が動くのは macOS（Apple シリコン）と Windows 10/11 だけです。TikTok のアプリの中やスマホでは使えないので、代わりにパソコンのブラウザーでライブ配信を開いてください。</p>`,
  },
  {
    q: "TikTok やブラウザーに何かをインストールする必要はありますか？",
    a: `<p>いいえ。ブラウザーの拡張機能やプラグインはなく、AI Translator が TikTok のアカウントに接続する必要もありません。アプリはパソコンで鳴っている音を聞き取るだけです。視聴にサインインが必要かどうかは TikTok が決めることです。</p>`,
  },
  {
    q: "TikTok ライブで販売しています。海外のお客さま向けに翻訳できますか？",
    a: `<p>いいえ。AI Translator には、あなたのライブ配信に字幕や翻訳した音声を追加する機能はありません。字幕を作るのはアプリを使っている本人が読むためで、その人のパソコンのフローティングバーに表示されます。</p>`,
  },
];

export default {
  id: "solutions-tiktok-live",
  lang: "ja",
  path: "/ja/solutions/tiktok-live-translation/",
  title: "TikTok ライブをリアルタイム翻訳",
  description:
    "パソコンのブラウザーで TikTok ライブを見ながら翻訳字幕を表示する方法。AI Translator にスマホ版はありません。手順と制限を紹介します。",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "パソコンで見る TikTok ライブをリアルタイム翻訳",
  lead: "中国語、日本語、韓国語など、アプリが対応する 5 言語のいずれかで話される TikTok ライブを翻訳字幕付きで見るには、パソコンのブラウザーでライブ配信を開いて AI Translator を起動します。アプリはマシンで再生されている音声を聞き取り、翻訳をフローティングバーに表示します。動くのは macOS と Windows だけなので、スマホの TikTok アプリの中では使えません。また、字幕はアプリを使って見ている本人が読むためだけのものです。",
  meta: "<span>更新日 {{updated}}</span><span>macOS と Windows のパソコンで動作、スマホには非対応</span>",
})}

<section class="section-tight"><div class="container narrow">
${callout({ kind: "warn", title: "試す前に：パソコン専用です。", text: "AI Translator にスマホ版はありません。いつも TikTok ライブをスマホで見ている場合は、同じライブ配信をパソコンのブラウザーで開くと翻訳字幕を表示できます。TikTok ライブについては、BGM が流れるベトナム語のライブ配信 1 件の結果しかなく、字幕は実用になりませんでした（下の「正直な限界」をご覧ください）。" })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "使い方", title: "翻訳字幕付きで TikTok ライブを見る 4 つのステップ" })}
${steps([
  { title: "AI Translator をインストールして開く", text: "<a href=\"/ja/download/\">ダウンロード</a>のページにあるインストールコマンドを、ターミナル（macOS）か PowerShell（Windows）に貼り付けます。<em>翻訳先の言語</em>で読みたい言語を選びます。" },
  { title: "パソコンで TikTok ライブを開く", text: "パソコンのブラウザーで TikTok のウェブサイトを開いてライブ配信を表示し（TikTok がウェブでの視聴を許可している場合）、音を出します。サインインや誰が視聴できるかは TikTok が決めることで、AI Translator とは関係ありません。" },
  { title: "ライブ配信の再生中に「開始」を押す", text: "<strong>開始</strong>を押します（ショートカット ⌃⌥T、Windows：Ctrl+Alt+T）。macOS では、初回にシステムから<em>システムオーディオの録音</em>の許可を求められます。<a href=\"/ja/guide/macos-audio-permission/\">許可の与え方</a>をご覧ください。アプリは最初の数秒でモデルを読み込みます（インストールや更新の直後の初回は長めで、数分かかることもあります）。" },
  { title: "字幕バーを映像の近くにドラッグする", text: "バーをライブ配信のすぐ下にドラッグし、「設定 › 字幕」で文字の大きさを設定して、<em>ロック（クリックを通過）</em>を押すと、マウスがバーを通過するようになります。" },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "コツ", title: "文が途中で切れるとき、BGM、複数の声への対処" })}
${checkList([
  "<strong>文が途中で切れる（話し手が言いよどんだり息継ぎをしたりする）：</strong><em>文を区切る間の長さ</em>（50〜800 ms）を長くすると、文が途中で切れにくくなります。字幕の表示は少し遅くなります。変更は次のセッションから適用されます。",
  "<strong>BGM や雑音が大きい：</strong>認識が悪くなり、アプリが言語を取り違えたり、誰も言っていない文を繰り返し表示したりして、翻訳が意味をなさなくなることがあります。はっきり話しているライブ配信のほうがうまくいきます。",
  "<strong>複数の人が同時に話す：</strong>アプリは聞こえた音を 1 文ずつ翻訳し、誰が話しているかは区別しません。",
  "<strong>ブラウザーの音だけを聞き取る（macOS）：</strong>システムの通知が翻訳されないように、先にライブ配信を再生してから「設定 › 音声」で<em>リストを更新</em>を押し、<em>{ブラウザー名} のみ</em>を選んで、それから「開始」を押します。Safari の項目名は<em>Safari と他のアプリ内の Web ページ のみ</em>です。新しいソースは次のセッションから適用されます。そのブラウザーのほかのタブの音も聞き取られます。",
  "<strong>Windows ではまだアプリを 1 つだけ選ぶことはできません：</strong>視聴中はシステムの通知を消音にしてください。",
  "<strong>中国語、韓国語、日本語、英語のライブ配信：</strong><em>翻訳先の言語</em>を自分の言語（英語、ベトナム語、中国語、日本語、韓国語）にします。話される言語がわかっていれば<em>音声の言語</em>を設定し、話し手が言語を切り替える場合は自動検出のままにします。翻訳の品質を測定したのはベトナム語を含む組み合わせだけです（<a href=\"/ja/features/#quality-by-direction\">表を見る</a>）。ほかの組み合わせも動きますが、測定したスコアはありません。",
])}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "正直な限界", title: "TikTok ライブに AI Translator が向いていないのは？", text: "限界を先に知っておけば、実りのないお試しをせずに済みます。" })}
${checkList([
  "<strong>TikTok ライブをスマホで見ている。</strong>AI Translator が動くのは macOS と Windows だけなので、スマホの TikTok アプリの中に字幕を表示することはできません。",
  "<strong>あなたが配信者で、視聴者のために翻訳したい。</strong>アプリが作る字幕は、アプリを使っている本人が自分のパソコンのフローティングバーで読むためのものです。あなたのライブ配信に字幕や翻訳した音声を追加することはありません。",
  "<strong>ライブ配信を録画したい、または動画をダウンロードしたい。</strong>アプリは音声や映像をディスクに録音・録画せず、動画ファイルも処理しません。残るのはテキストの文字起こしだけです。",
  "<strong>ライブ配信が英語、中国語、日本語、韓国語、ベトナム語ではない。</strong>アプリが対応しているのはこの 5 言語だけです。タイ語、インドネシア語などのライブ配信は、今のところ翻訳できません。",
], true)}
${callout({ kind: "warn", title: "機械翻訳は間違えることがあります。", text: "重要な判断（購入、支払い、契約）では、確認せずに AI Translator に頼らないでください。TikTok ライブについては、BGM が流れるベトナム語のライブ配信 1 件の結果しかありません。アプリは音声を取り込めましたが、BGM の影響で認識を誤ったため、字幕は実用になりませんでした。ブラウザーで再生した動画で動作を確認したほか、YouTube Live（英語のニュースチャンネル、macOS の Chrome、2026年10月25日）でも 1 回試しました。" })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "よくある質問", title: "TikTok ライブの翻訳：よくある質問" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "続けて読む", title: "次のステップ", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ja/solutions/livestream-translation/", icon: "play", title: "ライブ配信の翻訳", text: "しくみ、巻き戻せないことが多いライブ映像のためのコツ、翻訳時間について。どのライブ配信プラットフォームにも共通です。", more: "ソリューションを見る" })}
${linkCard({ href: "/ja/guide/quick-start/", icon: "zap", title: "クイックスタート", text: "インストールから最初の字幕まで。", more: "ガイドを開く" })}
${linkCard({ href: "/ja/pricing/", icon: "wallet", title: "料金", text: "10 日間の Free お試し。その後は Monthly、6 Months、Yearly を前払いで。", more: "料金を見る" })}
</div>
<p class="disclaimer">TikTok は各所有者の商標です。AI Translator は TikTok と提携していません。</p>
</div></section>

${ctaBand({ title: "次に見る TikTok ライブで試してみてください", text: "コマンド 1 つでインストールし、10 日間、1 日 30 分まで Free で試せます。カードもアカウントも不要です。", primary: { href: "/ja/download/", label: "ダウンロード" }, secondary: { href: "/ja/guide/quick-start/", label: "ガイドを開く" } })}
`,
};
