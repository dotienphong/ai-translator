import { pageHero, sectionHead, checkList, callout, ctaBand, steps, linkCard, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "솔루션", path: "/ko/solutions/" },
  { name: "TikTok 라이브 번역", path: "/ko/solutions/tiktok-live-translation/" },
];

const FAQ = [
  {
    q: "TikTok 라이브를 내 언어로 번역할 수 있나요?",
    a: `<p>원리상으로는 가능합니다. 앱은 컴퓨터에서 재생되는 오디오를 들으므로 웹사이트에 좌우되지 않고, 영어, 중국어, 일본어, 한국어, 베트남어로 말하는 사람의 말을 이 다섯 언어 중 다른 언어의 자막으로 보여 줄 수 있습니다. 하지만 TikTok 라이브의 경우 배경 음악이 흐르는 베트남어 라이브 방송 한 건의 결과만 있습니다. 앱은 소리를 가져왔지만 배경 음악 때문에 인식이 잘못되어 자막을 쓸 만한 수준이 아니었습니다. 영어, 중국어, 일본어, 한국어 TikTok 라이브에서의 결과는 없습니다. 브라우저에서 재생한 동영상으로 테스트해 보았고, YouTube 라이브로도 한 번 테스트했습니다(영어 뉴스 채널, macOS의 Chrome, 2026년 10월 25일). 브라우저에서 라이브 방송을 열고 AI Translator에서 ‘시작’을 누른 다음, 떠 있는 바의 번역 자막을 읽으면 됩니다.</p>`,
  },
  {
    q: "휴대폰에서도 되나요?",
    a: `<p>아니요. AI Translator는 macOS(Apple 실리콘)와 Windows 10/11에서만 실행됩니다. TikTok 앱 안이나 휴대폰에서는 쓸 수 없으니, 대신 컴퓨터 브라우저에서 라이브 방송을 여세요.</p>`,
  },
  {
    q: "TikTok이나 브라우저에 무언가를 설치해야 하나요?",
    a: `<p>아니요. 브라우저 확장 프로그램이나 플러그인이 없고, AI Translator가 TikTok 계정에 연결할 필요도 없습니다. 앱은 컴퓨터에서 재생되는 소리를 들을 뿐입니다. 시청하려면 로그인해야 하는지는 TikTok이 정합니다.</p>`,
  },
  {
    q: "TikTok 라이브로 판매하고 있습니다. 해외 고객을 위해 번역할 수 있나요?",
    a: `<p>아니요. AI Translator에는 내 라이브 방송에 자막이나 번역된 음성을 더하는 기능이 없습니다. 자막은 앱을 쓰는 사람이 자기 컴퓨터의 떠 있는 바에서 읽기 위해 만들어집니다.</p>`,
  },
];

export default {
  id: "solutions-tiktok-live",
  lang: "ko",
  path: "/ko/solutions/tiktok-live-translation/",
  title: "TikTok 라이브 실시간 번역",
  description:
    "컴퓨터 브라우저에서 TikTok 라이브를 보며 번역 자막을 표시하는 방법. AI Translator에는 휴대폰 버전이 없습니다. 단계와 제한을 안내합니다.",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "컴퓨터로 보는 TikTok 라이브를 실시간 번역하기",
  lead: "중국어, 일본어, 한국어를 비롯해 앱이 지원하는 다섯 언어 중 하나로 진행되는 TikTok 라이브를 번역 자막과 함께 보려면, 컴퓨터 브라우저에서 라이브 방송을 열고 AI Translator를 실행하세요. 앱이 기기에서 재생되는 오디오를 듣고 번역을 떠 있는 바에 보여 줍니다. macOS와 Windows에서만 실행되므로 휴대폰의 TikTok 앱 안에서는 쓸 수 없으며, 자막은 앱을 쓰는 본인이 읽기 위한 것일 뿐입니다.",
  meta: "<span>업데이트 {{updated}}</span><span>macOS와 Windows 컴퓨터에서 실행, 휴대폰은 지원하지 않음</span>",
})}

<section class="section-tight"><div class="container narrow">
${callout({ kind: "warn", title: "써 보기 전에 알아 두세요. 컴퓨터에서만 쓸 수 있습니다.", text: "AI Translator에는 휴대폰 버전이 없습니다. 평소 휴대폰으로 TikTok 라이브를 본다면, 같은 라이브 방송을 컴퓨터 브라우저에서 열어야 번역 자막을 볼 수 있습니다. TikTok 라이브의 경우 배경 음악이 흐르는 베트남어 라이브 방송 한 건의 결과만 있으며, 자막을 쓸 만한 수준이 아니었습니다(아래 ‘솔직한 한계’ 참고)." })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "시작하기", title: "번역 자막과 함께 TikTok 라이브를 보는 네 단계" })}
${steps([
  { title: "AI Translator 설치하고 열기", text: "<a href=\"/ko/download/\">다운로드</a> 페이지의 설치 명령을 터미널(macOS) 또는 PowerShell(Windows)에 붙여 넣으세요. <em>번역 언어</em>를 읽고 싶은 언어로 정하세요." },
  { title: "컴퓨터에서 TikTok 라이브 열기", text: "컴퓨터 브라우저에서 TikTok 웹사이트로 라이브 방송을 열고(TikTok이 웹에서 볼 수 있게 허용하는 경우) 소리가 나게 합니다. 로그인 여부와 누가 볼 수 있는지는 TikTok이 정하며 AI Translator와는 관계가 없습니다." },
  { title: "라이브 방송이 재생되는 동안 ‘시작’ 누르기", text: "<strong>시작</strong>을 누릅니다(단축키 ⌃⌥T, Windows: Ctrl+Alt+T). macOS에서는 처음에 시스템이 <em>시스템 오디오 녹음</em> 권한을 요청합니다. <a href=\"/ko/guide/macos-audio-permission/\">권한 허용 방법</a>을 참고하세요. 앱은 처음 몇 초 동안 모델을 불러옵니다(설치나 업데이트 직후 첫 실행은 더 오래, 최대 몇 분까지 걸릴 수 있습니다)." },
  { title: "자막 바를 영상 가까이 끌어 놓기", text: "바를 라이브 방송 바로 아래로 끌어 놓고 ‘설정 › 자막’에서 글자 크기를 정한 다음, <em>잠금(클릭 통과)</em>을 누르면 마우스가 바를 통과합니다." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "팁", title: "문장 끊김, 배경 음악, 여러 목소리에 대처하는 팁" })}
${checkList([
  "<strong>문장이 중간에 끊길 때(화자가 머뭇거리거나 숨을 쉴 때):</strong> <em>문장을 끝내는 정지 시간</em>(50~800 ms)을 올리면 문장이 덜 끊깁니다. 자막은 조금 늦게 나타납니다. 변경 사항은 다음 세션부터 적용됩니다.",
  "<strong>배경 음악이나 소음이 클 때:</strong> 인식이 나빠집니다. 앱이 언어를 잘못 판단하거나 아무도 하지 않은 문장을 되풀이해 표시할 수 있어, 번역이 뜻이 통하지 않을 수 있습니다. 말소리가 또렷한 라이브 방송일수록 잘 작동합니다.",
  "<strong>여러 사람이 동시에 말할 때:</strong> 앱은 들리는 소리를 문장 단위로 번역하며, 누가 말하는지는 구분하지 않습니다.",
  "<strong>브라우저 소리만 듣기(macOS):</strong> 시스템 알림이 번역되지 않도록 먼저 라이브 방송을 재생한 다음, ‘설정 › 오디오’에서 <em>목록 새로 고침</em>을 누르고 <em>{브라우저 이름}만</em>을 고른 뒤에 ‘시작’을 누르세요. Safari는 목록에 ‘Safari 및 다른 앱 안의 웹 페이지만’으로 표시됩니다. 새 소스는 다음 세션부터 적용되며, 그 브라우저의 다른 탭 소리도 들립니다.",
  "<strong>Windows는 아직 앱 하나만 고를 수 없습니다.</strong> 보는 동안 시스템 알림을 음소거하세요.",
  "<strong>중국어, 한국어, 일본어, 영어 라이브 방송:</strong> <em>번역 언어</em>를 내 언어(영어, 베트남어, 중국어, 일본어, 한국어)로 정합니다. 방송에서 쓰는 언어를 안다면 <em>원본 언어</em>를 그 언어로 정하고, 화자가 언어를 바꾼다면 자동 감지를 그대로 두세요. 번역 품질은 베트남어가 포함된 언어 쌍만 측정했습니다(<a href=\"/ko/features/#quality-by-direction\">표 보기</a>). 다른 쌍도 작동하지만 측정한 점수는 없습니다.",
])}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "솔직한 한계", title: "TikTok 라이브에 AI Translator가 맞지 않는 경우는?", text: "한계를 미리 알면 괜히 써 보는 수고를 덜 수 있습니다." })}
${checkList([
  "<strong>휴대폰으로 TikTok 라이브를 본다.</strong> AI Translator는 macOS와 Windows에서만 실행되므로 휴대폰의 TikTok 앱 안에는 자막을 표시하지 않습니다.",
  "<strong>내가 방송하는 사람이고, 시청자를 위해 번역하고 싶다.</strong> 앱이 만드는 자막은 앱을 쓰는 사람이 자기 컴퓨터의 떠 있는 바에서 읽기 위한 것입니다. 내 라이브 방송에 자막이나 번역된 음성을 더하지 않습니다.",
  "<strong>라이브 방송을 녹화하거나 동영상을 내려받아야 한다.</strong> 앱은 오디오나 영상을 디스크에 녹음·녹화하지 않고 동영상 파일을 처리하지도 않습니다. 남는 것은 텍스트 대본뿐입니다.",
  "<strong>라이브 방송이 영어, 중국어, 일본어, 한국어, 베트남어가 아니다.</strong> 앱은 이 다섯 언어만 지원합니다. 태국어, 인도네시아어 등 다른 언어의 라이브 방송은 아직 번역할 수 없습니다.",
], true)}
${callout({ kind: "warn", title: "기계 번역은 틀릴 수 있습니다.", text: "중요한 결정(구매, 결제, 계약)에서는 확인 없이 AI Translator에 의존하지 마세요. TikTok 라이브의 경우 배경 음악이 흐르는 베트남어 라이브 방송 한 건의 결과만 있습니다. 앱은 소리를 가져왔지만 배경 음악 때문에 인식이 잘못되어 자막을 쓸 만한 수준이 아니었습니다. 브라우저에서 재생한 동영상으로 테스트해 보았고, YouTube 라이브로도 한 번 테스트했습니다(영어 뉴스 채널, macOS의 Chrome, 2026년 10월 25일)." })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "자주 묻는 질문", title: "TikTok 라이브 번역: 자주 묻는 질문" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "계속 읽기", title: "다음 단계", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ko/solutions/livestream-translation/", icon: "play", title: "라이브 방송 번역", text: "작동 방식, 되감을 수 없는 경우가 많은 라이브 영상을 위한 팁, 번역 시간. 어떤 라이브 방송 플랫폼에도 해당합니다.", more: "솔루션 보기" })}
${linkCard({ href: "/ko/guide/quick-start/", icon: "zap", title: "빠른 시작", text: "설치부터 첫 자막까지.", more: "가이드 열기" })}
${linkCard({ href: "/ko/pricing/", icon: "wallet", title: "요금", text: "10일 Free 체험. 그 후에는 Monthly, 6 Months, Yearly를 선불로.", more: "요금 보기" })}
</div>
<p class="disclaimer">TikTok은 해당 소유자의 상표이며, AI Translator는 TikTok과 제휴 관계가 없습니다.</p>
</div></section>

${ctaBand({ title: "다음에 볼 TikTok 라이브에서 써 보세요", text: "명령 한 줄로 설치하고 10일 동안 하루 30분씩 Free로 써 보세요. 카드도 계정도 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/guide/quick-start/", label: "가이드 열기" } })}
`,
};
