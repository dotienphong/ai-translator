import { pageHero, appShot, facts, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "ホーム", path: "/ja/" },
  { name: "ガイド", path: "/ja/guide/" },
  { name: "音声の許可", path: "/ja/guide/macos-audio-permission/" },
];

const toc = [
  { level: 2, id: "which-permission", text: "アプリに必要な許可は？" },
  { level: 2, id: "permission-prompt", text: "macOS の許可の確認" },
  { level: 2, id: "if-you-refused", text: "拒否してしまった場合" },
  { level: 2, id: "signs-of-missing-permission", text: "許可がないときのサイン" },
  { level: 2, id: "why-no-error", text: "macOS がエラーを出さない理由" },
  { level: 2, id: "after-updates", text: "更新のたびに" },
  { level: 2, id: "audio-source", text: "音声ソースを選ぶ" },
];

const HOWTO_STEPS = [
  { name: "システム設定を開く", text: "AI Translator で「システム設定を開く」を押すか、自分でシステム設定を開いて「プライバシーとセキュリティ」を選びます。" },
  { name: "「画面とシステムオーディオの録音」を開く", text: "「プライバシーとセキュリティ」で「画面とシステムオーディオの録音」を選びます。" },
  { name: "AI Translator をオンにする", text: "「システムオーディオの録音のみ」の欄で、AI Translator をオンにします。" },
  { name: "もう一度試す", text: "必要なら AI Translator を開き直し、「開始」を押して音を再生し、字幕が表示されるか確かめます。" },
];

export default {
  id: "guide-audio-permission",
  lang: "ja",
  path: "/ja/guide/macos-audio-permission/",
  title: "macOS でシステムオーディオの録音を許可する",
  description:
    "macOS で AI Translator にシステムオーディオの録音を許可する方法：確認への答え方、システム設定でオンに戻す方法、許可がないときのサイン、音声ソースの選び方。",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-24",
  schema: [
    howTo({
      name: "AI Translator のシステムオーディオの録音をオンに戻す",
      description: "macOS の確認で拒否したあとに、システム設定で AI Translator のシステムオーディオの録音の許可をオンにする方法。",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "macOS でシステムオーディオの録音を許可する",
  lead: "コンピューターの音声を翻訳するために AI Translator に必要な macOS の許可は、Mac で再生されている音声を聞き取るためのシステムオーディオの録音です。マイクを含む入力元を選ぶと、マイクの許可も求められます。間違えて拒否した場合は、「システム設定 › プライバシーとセキュリティ › 画面とシステムオーディオの録音」でオンに戻してください。",
  meta: "<span>macOS 14.2 以降のみ</span> <span>更新日 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "このガイドの内容",
  body: `
<h2 id="which-permission">アプリに必要な許可は？</h2>
<p>AI Translator は、パソコンで再生されている音声（会議の音、動画、ウェビナー）を取り込んで、認識し翻訳します。そのため macOS は<strong>システムオーディオの録音</strong>の許可を求めます。既定の入力元（<strong>コンピューターの音声</strong>）ではマイクを開きません。マイクを開くのは、<strong>マイク</strong>または<strong>コンピューターの音声 + マイク</strong>を選んだときだけです（<a href="#microphone-permission">マイクの許可</a>）。会議をディスクに保存することはなく、音声は翻訳しているあいだメモリ上にとどまります。Windows にはシステムオーディオの許可の手順はありません。</p>
${facts([
  ["許可", "システムオーディオの録音"],
  ["オンに戻す場所", "システム設定 › プライバシーとセキュリティ › 画面とシステムオーディオの録音 › システムオーディオの録音のみ"],
  ["macOS が尋ねるとき", "AI Translator が初めて音声を取り込むとき：「試してみる」の手順か、初めて「開始」を押したとき"],
])}

<h2 id="permission-prompt">macOS の許可の確認</h2>
<p>AI Translator が初めて音声を取り込むとき、macOS は私たちが書いた説明を添えて、Mac の言語で許可の確認を表示します。日本語では次のとおりです：</p>
<blockquote>AI Translator は、翻訳字幕を表示するために、Mac で再生されている音声を取得します。音声が Mac の外に送信されることはありません。</blockquote>
<p>許可してください。アプリは初期設定のステップ 5 / 9 でもこのことをお知らせします（<a href="/ja/guide/quick-start/">クイックスタートガイド</a>をご覧ください）。</p>
${appShot({ slug: "app-onboarding-5", lang: "ja", alt: "設定ウィザードのシステムオーディオの録音を許可する手順と、システム設定を開くボタン", caption: "ステップ 5 / 9：アプリが許可について説明し、システム設定を開くボタンを表示します。" })}

<h2 id="if-you-refused">拒否してしまった場合：システム設定でオンに戻す</h2>
<ol>
<li>AI Translator で<strong>システム設定を開く</strong>を押します（初期設定のステップ 5 と、アプリが許可がないと知らせたときのホーム画面にあります）。または、自分でシステム設定を開きます。</li>
<li><strong>プライバシーとセキュリティ</strong>を選び、次に<strong>画面とシステムオーディオの録音</strong>を選びます。</li>
<li><strong>システムオーディオの録音のみ</strong>の欄を見つけて、<strong>AI Translator</strong> をオンにします。</li>
<li>アプリに戻って<strong>開始</strong>を押し、音の出るものを再生します。</li>
</ol>
<p>それでも字幕が表示されない場合は、AI Translator を完全に終了し（メニューバーのアイコンから<strong>終了</strong>を選びます）、もう一度開いてください。一覧にまだ AI Translator が表示されない場合は、アプリに戻って「開始」を一度押し（設定ウィザードの途中なら「サンプル文を再生」）、macOS に許可を求めさせてください。たいていそのあと一覧に表示されるので、もう一度確認します。システム設定の項目名は、macOS のバージョンによって少し異なることがあります。</p>

<h2 id="signs-of-missing-permission">許可がないときのサイン</h2>
<p>許可がないと、会議の音が出ていても字幕は表示されず、ホーム画面の「入力レベル」のバーも動きません。ほかのアプリから音が出ているとわかっているのに無音の状態がしばらく続くと、<strong>ホーム画面</strong>に次のように表示されます：</p>
<blockquote>アプリから音が出ているのに何も聞こえません。AI Translator にシステムオーディオの録音が許可されていない可能性があります。</blockquote>
<p>このメッセージには<strong>システム設定を開く</strong>ボタンが付いています。許可がないためにセッションが止まった場合は、ホーム画面に「AI Translator にシステムオーディオの録音が許可されていません。」と同じボタンとともに表示されます。字幕バーに出る一般的なお知らせ「音声が聞こえません。会議の音声が再生されているか確認してください。」と混同しないでください。こちらはしばらく音がないという意味だけで、単に静かな会議の場合もあります。</p>

<h2 id="why-no-error">拒否しても macOS がエラーを出さない理由</h2>
<p>許可が拒否されていても、macOS はアプリが取り込み元を作ることを許し、動作中と報告しますが、届けるサンプルはすべて無音です。報告すべきエラーがないため、AI Translator が許可がないことを見分けるには、ほかのアプリから音が出ているあいだに長い無音が続くのを待つしかありません。そのため、警告はすぐではなく、しばらくしてから表示されます。</p>

<h2 id="after-updates">更新のたびに、macOS がもう一度尋ねることがあります</h2>
<p>現在の macOS 版はアドホック署名のため、更新のたびに macOS がこの録音の許可をもう一度尋ねることがあります（キーチェーンのダイアログ 1 つとともに）。許可してください。データ、プラン、翻訳時間が失われることはありません。詳しくは <a href="/ja/guide/install-macos/">macOS へのインストールのガイド</a>をご覧ください。</p>

<h2 id="audio-source">音声ソースを選ぶ：システム全体か、1 つのアプリか</h2>
<p>この許可で両方のモードが使えます。モードは<strong>設定 › 音声 › 音声ソース</strong>で選びます：</p>
<ul>
<li><strong>システム全体（このアプリを除く）</strong>（初期設定）：Mac で再生されるものすべてを、通知音も含めて翻訳します。</li>
<li><strong>「{アプリ名} のみ」</strong>：会議アプリを選びます。通知などほかの音は翻訳されません。Safari とほかのアプリ内の Web ページは、「Safari と他のアプリ内の Web ページ」としてまとめて表示されます。</li>
</ul>
<p>一覧には<em>今まさに音を出している</em>アプリしか表示されません。会議が始まってから<strong>リストを更新</strong>を押してください。新しい音声ソースは次のセッションから反映されます。選んだアプリから音が出なくなると、アプリに「選択したアプリから音が出ていません」と表示され、再び音が出るとすぐに翻訳が続きます。</p>
${appShot({ slug: "app-settings-audio", lang: "ja", alt: "音声の設定：音声ソースの選択（Zoom のみ）、リストを更新ボタン、文を区切る間の長さのスライダー", caption: "設定 › 音声：音声ソースと、文の区切りの感度。" })}

${docNav(
  [
    { href: "/ja/guide/install-macos/", kicker: "前へ", title: "AI Translator を macOS にインストール" },
    { href: "/ja/guide/subtitle-bar-and-shortcuts/", kicker: "次へ", title: "字幕バーとショートカット" },
    { href: "/ja/guide/troubleshooting/", kicker: "関連", title: "トラブルシューティング" },
  ],
  "関連するガイド",
)}
`,
})}
</div></section>
`,
};
