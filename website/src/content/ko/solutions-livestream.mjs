import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, overlayShot, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "솔루션", path: "/ko/solutions/" },
  { name: "라이브 방송 번역", path: "/ko/solutions/livestream-translation/" },
];

const FAQ = [
  {
    q: "라이브 방송을 내 언어로 번역하려면 어떻게 하나요?",
    a: `<p>컴퓨터에 AI Translator를 설치하고 브라우저에서 라이브 방송을 연 다음, ‘번역 언어’에서 읽고 싶은 언어(영어, 베트남어, 중국어, 일본어, 한국어)를 고르고 ‘시작’을 누르세요. 앱은 컴퓨터에서 재생되는 오디오를 듣고 떠 있는 바에 번역 자막을 보여 줍니다. 화자가 문장을 마친 뒤 자막이 나타나기까지의 지연은 중앙값 0.76~1.03초이며, Mac M4 Pro(Standard 팩)에서 측정했습니다. 번역 품질은 베트남어가 포함된 언어 쌍만 측정했습니다(<a href="/ko/features/#quality-by-direction">표 보기</a>). 일본어→영어 같은 다른 언어 쌍도 작동하지만 측정한 점수는 없습니다.</p>`,
  },
  {
    q: "TikTok 라이브, YouTube, Facebook 라이브에서 쓸 수 있나요?",
    a: `<p>앱은 컴퓨터의 시스템 오디오를 가져오므로 플랫폼에 좌우되지 않습니다. 라이브 방송의 소리가 컴퓨터에서 재생되면 앱이 그 소리를 들을 수 있습니다. 브라우저에서 재생한 동영상으로 테스트해 보았습니다. 개별 라이브 방송 플랫폼에서는 테스트하지 않았습니다. <a href="/ko/solutions/tiktok-live-translation/">TikTok 라이브 번역하기</a>도 참고하세요.</p>`,
  },
  {
    q: "휴대폰에서 라이브 방송을 번역할 수 있나요?",
    a: `<p>아니요. AI Translator는 macOS(Apple 실리콘)와 Windows 10/11에서만 실행되므로, 컴퓨터로 라이브 방송을 볼 때만 쓸 수 있습니다.</p>`,
  },
  {
    q: "실시간 번역에 인터넷이 필요한가요?",
    a: `<p>번역 자체에는 필요 없습니다. 음성 인식, 번역, 자막은 내 컴퓨터에서 실행되며, 오디오는 어디로도 전송되지 않습니다. 다만 라이브 방송을 보려면 인터넷이 필요합니다.</p>`,
  },
  {
    q: "내 라이브 방송을 시청자를 위해 번역할 수 있나요?",
    a: `<p>아니요. AI Translator에는 내 라이브 방송에 자막이나 번역된 음성을 더하는 기능이 없습니다. 자막은 앱을 쓰는 사람이 자기 컴퓨터의 떠 있는 바에서 읽기 위해 만들어집니다.</p>`,
  },
  {
    q: "라이브 번역은 무료인가요?",
    a: `<p>Free 요금제는 하루 최대 30분까지 번역할 수 있는 10일 체험이며, 카드도 계정도 필요 없습니다. 그 후에는 선불 요금제가 필요합니다. <a href="/ko/pricing/">요금</a>을 참고하세요. Free는 체험판이며 계속 무료로 쓰는 요금제가 아닙니다.</p>`,
  },
];

export default {
  id: "solutions-livestream",
  lang: "ko",
  path: "/ko/solutions/livestream-translation/",
  title: "라이브 방송 실시간 번역 자막",
  description:
    "컴퓨터에서 YouTube, TikTok 등의 라이브 방송을 보며 실시간 번역 자막을 표시합니다. AI가 내 컴퓨터에서 실행되며 휴대폰 버전은 없습니다.",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "라이브 영상 번역: 라이브 방송에 실시간 번역 자막",
  lead: "AI Translator는 컴퓨터용 라이브 영상 번역기로, 라이브 방송을 실시간으로 번역해 화면에 자막으로 보여 줍니다. 기기에서 재생되는 오디오를 들으므로 확장 프로그램 없이 브라우저의 라이브 영상에 쓸 수 있고, 음성 인식과 번역 모두 내 컴퓨터에서 실행됩니다. macOS와 Windows에서만 실행되며 휴대폰에서는 쓸 수 없습니다. 또한 자막은 앱을 쓰는 본인이 읽기 위한 것일 뿐이며, 앱이 내 라이브 방송을 시청자용으로 번역해 주지는 않습니다.",
  meta: "<span>업데이트 {{updated}}</span><span>macOS와 Windows 컴퓨터에서 실행, 휴대폰은 지원하지 않음</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["지원 대상", "컴퓨터의 브라우저나 앱에서 재생되는 라이브 방송<small><span lang=\"en\">TikTok Live, YouTube, Facebook Live</span>. 앱은 컴퓨터의 소리를 들으므로 플랫폼에 좌우되지 않습니다. 개별 플랫폼에서는 테스트하지 않았습니다</small>"],
  ["언어", "영어, 중국어(中文), 일본어(日本語), 한국어, 베트남어(Tiếng Việt)<small>번역 품질은 베트남어가 포함된 언어 쌍만 측정했습니다</small>"],
  ["지연", "중앙값 0.76~1.03초<small>화자가 문장을 마친 뒤부터. Mac M4 Pro, Standard 팩. 성능이 낮은 기기에서는 더 느립니다</small>"],
  ["플랫폼", "macOS 14.2 이상(Apple 실리콘)과 Windows 10/11 x64<small>휴대폰이나 태블릿용 버전은 없습니다</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "이런 분께", title: "라이브 방송은 훌륭한데 내 언어가 아닐 때", center: true })}
<div class="grid grid-3">
${feature({ icon: "play", title: "다른 언어로 된 라이브 방송 시청자", text: "크리에이터, 연사, 방송사가 영어, 중국어, 일본어, 한국어로 진행하는 라이브 방송을 방송 중에 바로 이해하고 싶은 분." })}
${feature({ icon: "users", title: "라이브 행사를 따라가는 분", text: "외국어로 진행되는 콘퍼런스, 제품 발표, 라이브 커머스 방송을 말하지 않고 보고 듣기만 하는 분." })}
${feature({ icon: "book", title: "학습자", text: "외국어로 진행되는 실시간 강의, 수업, 강연을 한 문장씩 따라가고 싶은 분." })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">작동 방식</span>
<h2>내 컴퓨터에서 라이브 방송을 실시간 번역</h2>
${checkList([
  "컴퓨터의 브라우저(또는 앱)에서 라이브 방송을 열고 AI Translator에서 <strong>시작</strong>을 누릅니다",
  "앱이 컴퓨터에서 재생되는 소리를 캡처해 문장 단위로 나눈 뒤, 내 기기에서 음성을 인식하고 번역합니다",
  "번역은 라이브 방송 창 위에 떠 있는 자막 바에 나타나며, 원문은 그 위에 작은 글씨로 표시됩니다",
  "브라우저 확장 프로그램이 필요 없고, 앱은 어떤 플랫폼 계정에도 연결하지 않습니다. 자막 바는 사용 중인 창의 포커스를 빼앗지 않으므로 채팅 입력을 계속할 수 있습니다",
])}
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "ko", alt: "세 문장을 표시한 AI Translator 자막 바. 이미 한국어인 문장은 한 줄로, 중국어 문장과 영어 문장은 각각 작은 원문 아래에 큰 글씨의 한국어 번역으로 표시", caption: "실제 자막 바: 위에는 작은 원문, 아래에는 번역." })}
</div>
</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "시작하기", title: "번역 자막과 함께 라이브 방송을 보는 네 단계" })}
${steps([
  { title: "컴퓨터에서 라이브 방송 열기", text: "컴퓨터의 브라우저(또는 앱)에서 라이브 방송을 열고 소리가 나게 합니다. macOS에서는 처음 ‘시작’을 누를 때 시스템이 <em>시스템 오디오 녹음</em> 권한을 요청합니다. <a href=\"/ko/guide/macos-audio-permission/\">권한 허용 방법</a>을 참고하세요." },
  { title: "언어 고르기", text: "<em>번역 언어</em>를 읽고 싶은 언어로 정합니다. 라이브 방송 전체가 한 언어라면 <em>원본 언어</em>를 <em>자동 감지</em> 대신 그 언어로 정하고, 화자가 언어를 바꾼다면 자동 감지를 그대로 두세요." },
  { title: "‘시작’ 누르기", text: "라이브 방송을 재생하기 전이나 방송이 시작될 때 <strong>시작</strong>을 누릅니다(단축키 ⌃⌥T, Windows: Ctrl+Alt+T). 앱은 처음 몇 초 동안 모델을 불러옵니다(설치나 업데이트 직후 첫 실행은 더 오래, 최대 몇 분까지 걸릴 수 있습니다)." },
  { title: "자막 바 배치하기", text: "바를 영상 바로 아래로 끌어 놓고 ‘설정 › 자막’에서 글자 크기와 색을 정한 다음, <em>잠금(클릭 통과)</em>을 누르면 마우스가 바를 통과합니다." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "팁", title: "되감을 수 없는 경우가 많은 라이브 방송을 위한 설정" })}
${checkList([
  "<strong>오디오 소스를 ‘{앱 이름}만’으로 고르기(macOS):</strong> 시스템 알림이 번역되지 않도록 먼저 라이브 방송을 재생한 다음, ‘설정 › 오디오’에서 <em>목록 새로 고침</em>을 누르고(소리를 내는 앱만 목록에 표시됩니다) 라이브 방송을 재생하는 브라우저를 고른 뒤에 ‘시작’을 누르세요. Safari는 목록에 ‘Safari 및 다른 앱 안의 웹 페이지만’으로 표시됩니다. 새 소스는 다음 세션부터 적용됩니다. 그 브라우저의 다른 탭 소리도 들리므로 다른 탭은 음소거하세요.",
  "<strong>Windows는 아직 앱 하나만 고를 수 없습니다.</strong> 보는 동안 시스템 알림을 음소거하세요.",
  "<strong>문장을 끝내는 정지 시간</strong>은 50~800 ms로 정할 수 있습니다. 짧을수록 자막이 빨리 나타나고, 길수록 문장이 덜 끊깁니다. 화자가 머뭇거리거나 숨을 쉬느라 문장이 중간에 끊긴다면 값을 올려 보세요. 변경 사항은 다음 세션부터 적용됩니다.",
  "<strong>문장을 놓쳤다면:</strong> 바가 잠겨 있을 때는 ⌃⌥PageUp(Windows: Ctrl+Alt+PageUp)으로 이전 문장을 보고 ⌃⌥PageDown으로 돌아옵니다. 바가 잠겨 있지 않을 때는 바 위에서 스크롤하고 <em>최신</em>을 눌러 실시간 줄로 돌아갑니다. 모든 요금제에서 가장 최근 세션의 대본을 보고, 검색하고, 복사할 수도 있습니다. 새 세션을 시작하면 이 대본은 새 대본으로 바뀝니다(<a href=\"/ko/guide/history-and-export/\">기록과 내보내기</a>).",
])}
${callout({ title: "긴 라이브 방송의 번역 시간.", text: "번역 시간은 번역한 발화만 계산하며 조용한 시간은 계산하지 않습니다. 이미 읽고 싶은 언어로 된 문장도 세지 않습니다. Free는 10일 체험 동안 하루 30분이므로, 긴 라이브 방송에는 Monthly(30일마다 50시간), 6 Months(30일마다 100시간), Yearly(무제한)가 필요합니다. <a href=\"/ko/pricing/\">요금</a>을 참고하세요." })}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "솔직한 한계", title: "라이브 방송에 AI Translator가 맞지 않는 경우는?", text: "한계를 미리 알면 괜히 써 보는 수고를 덜 수 있습니다." })}
${checkList([
  "<strong>휴대폰으로 본다.</strong> AI Translator는 macOS와 Windows에서만 실행되므로 휴대폰 앱 안에는 자막을 표시하지 않습니다. 쓰려면 컴퓨터에서 라이브 방송을 여세요.",
  "<strong>내가 방송하는 사람이고, 시청자를 위해 번역하고 싶다.</strong> 앱이 만드는 자막은 앱을 쓰는 사람이 자기 컴퓨터의 떠 있는 바에서 읽기 위한 것입니다. 내 라이브 방송에 자막이나 번역된 음성을 더하지 않습니다.",
  "<strong>라이브 방송을 녹화하거나, 동영상을 내려받거나, 동영상 파일로 자막 파일을 만들어야 한다.</strong> 앱은 오디오나 영상을 디스크에 녹음·녹화하지 않고 동영상 파일을 처리하지도 않습니다. 남는 것은 텍스트 대본뿐이며 요약 모드도 없습니다.",
  "<strong>소리가 또렷하지 않다.</strong> 배경 음악이나 소음이 크거나 여러 사람이 동시에 말하면 인식이 나빠지고 번역이 틀릴 가능성이 커집니다.",
  "<strong>Windows나 성능이 낮은 기기에서 속도가 필요하다.</strong> 0.76~1.03초의 지연은 Mac M4 Pro에서 Standard 팩으로 측정했습니다. Windows는 내장 그래픽 노트북 한 대에서 예비 측정만 했으며, 이보다 느립니다(<a href=\"/ko/features/#performance\">측정 조건</a>).",
  "<strong>라이브 방송이 영어, 중국어, 일본어, 한국어, 베트남어가 아니다.</strong> 앱은 이 다섯 언어만 지원합니다. 태국어, 인도네시아어 등 다른 언어의 라이브 방송은 아직 번역할 수 없습니다.",
], true)}
${callout({ kind: "warn", title: "기계 번역은 틀릴 수 있습니다.", text: "중요한 결정(구매, 계약, 의료, 법률, 금융)에서는 전문가의 확인 없이 AI Translator에 의존하지 마세요." })}
<p>브라우저에서 재생한 동영상으로 테스트해 보았습니다. 개별 라이브 방송 플랫폼에서는 테스트하지 않았습니다.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "자주 묻는 질문", title: "라이브 방송 번역: 자주 묻는 질문" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "계속 읽기", title: "다음 단계", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ko/solutions/tiktok-live-translation/", icon: "play", title: "TikTok 라이브 번역하기", text: "컴퓨터 브라우저에서 TikTok 라이브를 번역 자막과 함께 보는 방법과 TikTok 라이브만의 한계.", more: "가이드 보기" })}
${linkCard({ href: "/ko/solutions/webinar-and-video-translation/", icon: "book", title: "웨비나, 강좌, 동영상", text: "몇 시간짜리 세션을 포함해 다른 언어로 된 녹화 콘텐츠.", more: "솔루션 보기" })}
${linkCard({ href: "/ko/guide/quick-start/", icon: "zap", title: "빠른 시작", text: "설치부터 첫 자막까지.", more: "가이드 열기" })}
</div>
<p class="center-text reveal">보는 내용이 어딘가로 전송되는지 궁금한가요? <a href="/ko/data-security/">데이터와 보안</a>을 참고하세요.</p>
<p class="disclaimer">TikTok, YouTube, Facebook 및 기타 제품 이름은 각 소유자의 자산이며, AI Translator는 이들과 제휴 관계가 없습니다.</p>
</div></section>

${ctaBand({ title: "다음 라이브 방송에서 써 보세요", text: "명령 한 줄로 설치하고 10일 동안 하루 30분씩 Free로 써 보세요. 카드도 계정도 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/pricing/", label: "요금 보기" } })}
`,
};
