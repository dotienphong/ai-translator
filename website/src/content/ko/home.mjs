import { RELEASE } from "../../site.mjs";
import { dataFlow, demo, demoVideo, feature, steps, plansGrid, faq, ctaBand, sectionHead, icon, facts, linkCard, appShot, overlayShot, callout, checkList } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_TEXT = `영어로 말하는 동료의 발언에 한국어 자막이 표시되고, 이어서 입력 번역이 한국어로 쓴 답장을 영어로 바꿔 채팅으로 보냅니다. ${videoMeta("ko").seconds}초 분량, 소리가 있는 영상입니다.`;

export const HOME_FAQ = [
  {
    q: "AI Translator를 쓰려면 인터넷 연결이 필요한가요?",
    a: `<p>번역하는 동안에는 필요 없습니다. 음성 인식, 번역, 자막 표시는 모두 내 컴퓨터에서 이루어집니다. 인터넷이 필요한 경우는 처음에 앱과 모델(약 1.3GB 또는 2.5GB)을 내려받을 때, 무료 체험을 등록할 때, 요금제를 구매할 때, 라이선스를 확인할 때(유료 요금제는 확인 사이에 최대 14일 동안 오프라인으로 사용할 수 있습니다), 그리고 앱을 업데이트할 때뿐입니다.</p>`,
  },
  {
    q: "컴퓨터에서 회의 자막을 오프라인으로 번역하는 앱이 있나요?",
    a: "<p>네. AI Translator(aitranslator.io.vn)는 macOS 14.2 이상(Apple 실리콘)과 Windows 10/11 64비트(x64)용 데스크톱 앱으로, 컴퓨터에서 재생되는 모든 오디오에 실시간 번역 자막을 보여 줍니다. 음성 인식과 번역이 기기에서 실행되므로 번역 중에는 인터넷이 필요 없고, 음성이 컴퓨터 밖으로 나가지 않습니다. 영어, 중국어, 일본어, 한국어, 베트남어를 지원하며 10일 무료 체험이 있습니다.</p>",
  },
  {
    q: "봇 없이 Zoom 회의를 내 언어로 번역하려면 어떻게 하나요?",
    a: "<p>AI Translator를 열고 읽고 싶은 언어를 고른 다음 '시작'을 누르세요. 앱이 컴퓨터에서 재생되는 Zoom 오디오를 듣고 떠 있는 자막 바에 번역 자막을 보여 줍니다. 봇이 회의에 참가하지 않고, 호스트가 무언가를 켜야 할 필요도 없습니다. 다른 참가자에게는 알림이 가지 않으므로, 규정상 알려야 한다면 직접 알려 주세요.</p>",
  },
  {
    q: "회의 번역 자막을 무료로 받을 수 있나요?",
    a: "<p>AI Translator에는 하루 최대 30분까지 번역할 수 있는 10일 무료 체험이 있으며, 카드도 계정도 필요 없습니다. 그 후에는 선불 요금제가 필요합니다: Monthly 50,000 ₫(30일마다 50시간), 6 Months 269,000 ₫(180일 동안 30일마다 100시간), Yearly 500,000 ₫(365일 무제한). Free는 체험판이며 계속 무료로 쓰는 요금제가 아닙니다.</p>",
  },
  {
    q: "회의 음성이 어딘가로 전송되나요?",
    a: `<p>아니요. 번역하는 동안 음성은 메모리(RAM)에만 있고, 디스크에 저장되거나 네트워크로 전송되지 않습니다. macOS에서 네트워크 프록시로 확인한 결과, 번역 중에 앱이 외부로 보낸 음성이나 받아쓰기 텍스트는 없었습니다.</p>`,
  },
  {
    q: "Zoom, Teams, Google Meet, Zalo에서 쓸 수 있나요?",
    a: `<p>네. 앱이 컴퓨터의 시스템 오디오를 가져오므로 어떤 회의 앱, 웨비나, 동영상을 쓰든 상관없고, 봇이나 플러그인도 필요 없습니다. macOS에서 Zoom, Google Meet, Microsoft Teams, Zalo PC의 오디오 캡처를 테스트했습니다(내부 테스트이며 해당 회사의 인증이 아닙니다). macOS에서는 특정 앱 하나의 소리만 듣도록 선택할 수도 있습니다.</p>`,
  },
  {
    q: "AI Translator는 어떤 언어를 지원하나요?",
    a: `<p>원본 음성과 번역 모두 다섯 가지 언어를 지원합니다: 영어, 중국어(中文), 일본어(日本語), 한국어, 베트남어(Tiếng Việt). 앞으로 더 많은 언어를 추가할 계획입니다(일정은 아직 없습니다). 앱 화면은 베트남어, 영어, 일본어, 중국어(간체), 한국어로 표시할 수 있습니다.</p>`,
  },
  {
    q: "계정을 만들어야 하나요?",
    a: `<p>아니요. 로그인 과정이 없습니다. Free 체험은 이용 약관에 동의하기만 하면 되고, 유료 요금제는 결제 후 이메일로 받는 라이선스 키로 활성화합니다.</p>`,
  },
  {
    q: "베트남 밖에서도 결제할 수 있나요?",
    a: `<p>네. 베트남 은행에서 VND로 하는 VietQR 계좌 이체 외에도, 앱의 업그레이드 화면에서 Creem 결제 페이지를 통해 해외 카드로 미국 달러로 결제할 수 있습니다: Monthly US$3.99, 6 Months US$21.99, Yearly US$39.99(세금 별도). Creem 목록에 있는 일부 국가에서는 카드를 사용할 수 없습니다. Free 체험에는 결제 수단이 필요 없습니다.</p>`,
  },
  {
    q: "지금 어디서 내려받을 수 있나요?",
    a: `<p>macOS에서는 터미널에 명령 한 줄을 붙여 넣어 설치합니다. 명령은 <a href="/ko/download/">다운로드 페이지</a>에 있으며, '확인 없이 열기'를 누르지 않아도 앱이 바로 열립니다. Windows 버전도 같은 페이지에 있는 명령 한 줄을 PowerShell에 붙여 넣어 설치합니다.</p>`,
  },
];

export default {
  id: "home",
  lang: "ko",
  path: "/ko/",
  title: "회의 실시간 번역 자막, 오프라인 실행 | AI Translator",
  description:
    "Zoom, Teams, Google Meet 등 모든 앱에서 실시간 번역 자막을 읽으세요. 영어, 중국어, 일본어, 한국어, 베트남어 지원. AI가 내 컴퓨터에서 실행되며 클라우드를 쓰지 않습니다.",
  software: true,
  modified: "2026-10-22",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    videoObject({ lang: "ko", name: "AI Translator 데모 영상: 회의 번역 자막과 입력 번역", description: VIDEO_TEXT, uploadDate: "2026-10-22" }),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS(Apple 실리콘) · Windows 10/11 · 10일 무료 체험</p>
<h1 class="reveal"><em>모든 회의</em>에 AI 번역 자막을, 내 컴퓨터에서</h1>
<p class="lead reveal">AI Translator는 내 컴퓨터에서 실행되는 AI로, 컴퓨터에서 재생되는 소리를 화면 위 번역 자막으로 바꿉니다. 지연이 짧습니다. 음성과 회의 내용은 클라우드로 전송되지 않으며, 어떤 클라우드 AI 서비스도 거치지 않습니다. Zoom, Microsoft Teams, Google Meet, Zalo PC, 웨비나, 동영상에서 쓸 수 있습니다. 봇도 계정도 필요 없습니다.</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/ko/download/">다운로드 ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-it-works">작동 방식 보기</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI가 100% 기기에서 실행</li>
<li>${icon("check")} 회의 데이터는 클라우드로 가지 않음</li>
<li>${icon("check")} 낮은 지연</li>
<li>${icon("check")} 봇도 계정도 필요 없음</li>
</ul>
</div>
<div class="reveal">
${demo({
  title: "팀 회의(예시)",
  rec: "번역 중",
  langs: "EN → KO",
  note: "예시: 화면 아래쪽에 번역 자막 바가 떠 있는 온라인 회의",
  names: ["Aiko", "Wei", "Maria", "Tom"],
  pairs: [
    { src: "We will send the quotation by next week.", dst: "다음 주까지 견적서를 보내 드리겠습니다." },
    { src: "Will this specification be ready for next month's release?", dst: "이 사양이 다음 달 출시에 맞춰 준비될까요?" },
    { src: "Let's review the schedule in the next meeting.", dst: "다음 회의에서 일정을 검토합시다." },
  ],
  floatA: { icon: "wifi-off", text: "오프라인 실행" },
  floatB: { icon: "lock", text: "음성은 기기에 남습니다" },
})}
</div>
</div></section>

<section class="section-tight" id="video-demo"><div class="container">
${sectionHead({ eyebrow: "데모 영상", title: "AI Translator가 작동하는 모습", text: VIDEO_TEXT, center: true })}
${demoVideo({ lang: "ko", label: "AI Translator 데모 영상: 회의 번역 자막과 입력 번역", fallback: "데모 영상 내려받기(MP4, 2MB)" })}
</div></section>

<section class="section-tight"><div class="container narrow">
<h2 class="sr-only">AI Translator란?</h2>
<p class="lead reveal"><strong>AI Translator</strong>는 컴퓨터에서 재생되는 소리에 실시간 번역 자막을 보여 주는 데스크톱 앱입니다. 음성을 인식하고 번역한 뒤 그 결과를 떠 있는 자막 바에 보여 주며, 모든 과정이 내 컴퓨터에서 이루어집니다. 회의에 봇이 참가하지 않고 계정을 만들 필요도 없습니다. macOS 버전(Apple 실리콘)은 명령 한 줄로 설치하고, Windows 10/11 버전도 PowerShell 명령 한 줄로 설치합니다.</p>
<div class="reveal">${facts([
  ["제품 유형", "실시간 번역 자막 데스크톱 앱"],
  ["현재 버전", RELEASE.ko],
  ["플랫폼", "macOS 14.2 이상(Apple 실리콘)과 Windows 10/11 x64<small>둘 다 명령 한 줄로 설치</small>"],
  ["언어", "영어, 중국어(中文), 일본어(日本語), 한국어, 베트남어(Tiếng Việt)<small>원본 음성과 번역 모두 지원. 앞으로 더 많은 언어를 추가할 계획입니다</small>"],
  ["처리", "100% 기기에서 처리하며 음성은 외부로 전송되지 않음<small>음성 인식과 번역 모두 기기에서 실행</small>"],
  ["가격", "10일 무료 체험 · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>VietQR(VND) 또는 해외 카드(USD)로 선불, 자동 갱신 없음</small>"],
  ["제공자", "Đỗ Tiến Phong<small>지원: support@aitranslator.io.vn</small>"],
])}</div>
</div></section>

<section class="section-tight"><div class="container">
<ul class="app-strip reveal"><li>Zoom</li><li>Microsoft Teams</li><li>Google Meet</li><li>Zalo PC</li><li>웨비나</li><li>온라인 동영상</li></ul>
<p class="disclaimer">컴퓨터에서 재생되는 모든 소리에 쓸 수 있습니다. Zoom, Microsoft Teams, Google Meet, Zalo는 각 소유자의 제품 이름이며, AI Translator는 이들과 제휴 관계가 없습니다.</p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "데이터는 내 컴퓨터에 남습니다", title: "AI가 내 컴퓨터에서 실행되므로 회의 내용이 밖으로 나가지 않습니다", text: "음성 인식, 번역, 자막 표시는 모두 내 컴퓨터에서 이루어집니다. AI Translator는 회의 음성이나 내용을 클라우드로 보내지 않으며, 처리에 클라우드 AI 서비스를 쓰지 않습니다.", center: true })}
${dataFlow("ko")}
<div class="grid grid-3">
${feature({ icon: "lock", title: "클라우드로 아무것도 보내지 않음", text: "음성은 RAM에만 있으며 디스크에 저장되거나 네트워크로 전송되지 않습니다. 받아쓰기와 번역은 화면에 표시되고 내 컴퓨터에 남습니다. 기록은 기본으로 꺼져 있으며, 켜더라도 내 컴퓨터에 암호화되어 저장됩니다.", accent: true })}
${feature({ icon: "zap", title: "낮은 지연", text: "서버를 오갈 필요가 없어 화자가 문장을 마치면 바로 자막이 나타납니다. Mac M4 Pro(Standard 모델 팩)에서 중앙값은 1.1초 미만입니다. 다른 컴퓨터는 더 느립니다. 내장 그래픽을 쓰는 Windows 노트북 한 대에서 한 예비 테스트에서는 중앙값이 1.3~5.4초였습니다(기능 페이지의 '성능' 참조)." })}
${feature({ icon: "shield", title: "정보 유출 위험 감소", text: "계약, 인사, 재무, 제품 계획 등 회의 내용이 번역을 위해 제3자에게 넘어가지 않습니다. 서버에는 이메일(구매 시), 주문, 라이선스, 기기 활성화 정보(해시 처리한 기기 ID와 기기 이름), Free 체험 시작 시점(해시 처리한 기기 ID), 라이선스 변경 기록, 개인 정보를 지운 오류 보고서(30일 보관)만 저장하며, 대화 데이터는 절대 저장하지 않습니다." })}
</div>
<p class="center-text reveal"><a class="btn btn-secondary" href="/ko/data-security/">데이터가 어디로 가는지 자세히 보기 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt" id="how-it-works"><div class="container">
${sectionHead({ eyebrow: "작동 방식", title: "설치부터 첫 자막까지 세 단계", text: "복잡한 설정도, 회의에 초대할 봇도 없습니다.", center: true })}
${steps([
  { title: "앱을 설치하고 모델을 한 번만 내려받기", text: "앱을 열고 시작 안내를 따라 시스템 오디오 녹음을 허용한 다음(macOS), 모델을 컴퓨터에 내려받습니다(팩에 따라 약 1.3GB 또는 2.5GB). 그 후에는 모두 오프라인으로 실행됩니다." },
  { title: "회의가 시작되면 '시작' 누르기", text: "읽고 싶은 언어(<strong>번역 언어</strong>)를 고른 다음 <strong>시작</strong>을 누르거나 단축키를 쓰세요. Zoom, Teams, Meet, 동영상 등 컴퓨터에서 재생되는 것이라면 무엇이든 듣습니다." },
  { title: "떠 있는 자막 읽기", text: "화자가 문장을 마치면 곧 자막 바에 번역이 나타나고(Mac M4 Pro에서 지연 중앙값은 1.1초 미만이며 다른 컴퓨터는 더 느릴 수 있습니다), 그 위에 원문이 작은 글씨로 표시됩니다(끌 수 있습니다). 끌어서 옮기고, 크기와 글자 크기를 바꾸고, 위치를 잠글 수 있습니다." },
])}
<p class="center-text reveal"><a class="btn btn-ghost" href="/ko/guide/quick-start/">빠른 시작 가이드 읽기 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">자막 바</span>
<h2>어떤 배경에서도 잘 읽히는 플로팅 자막</h2>
<p class="lead">항상 위에 떠 있으면서도 회의 앱의 포커스를 빼앗지 않는 바입니다. 번역은 단어 단위로 나타나고, 아직 확정되지 않은 문장은 흐리게 표시되며, 원문은 위에 작은 글씨로 표시됩니다(기본으로 켜져 있으며 끌 수 있습니다).</p>
${checkList([
  "끌어서 옮기고, 가장자리를 끌어 크기를 바꿉니다. 위치는 화면마다 기억됩니다",
  "글자 크기 14~48px, 글자 색 5가지, 배경 색 5가지, 배경 불투명도 조절",
  "<strong>잠금</strong>하면 마우스 클릭이 그대로 통과해 회의 앱 조작을 방해하지 않습니다",
  "마우스 휠이나 단축키로 이전 문장을 다시 볼 수 있습니다",
])}
<p><a class="btn btn-secondary" href="/ko/features/">모든 기능 보기 ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "ko", alt: "원문을 위에 작은 글씨로, 그 아래 한국어 번역을 보여 주는 AI Translator 자막 바", caption: "실제 자막 바: 위에는 작은 원문, 아래에는 번역." })}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-home-running", lang: "ko", alt: "세션 중인 AI Translator 메인 화면: 번역 중 상태, 언어, 오디오 소스, 남은 번역 시간", caption: "세션 중인 메인 화면(Monthly 요금제)." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">간단한 조작</span>
<h2>필요한 모든 것을 한 화면에</h2>
<p class="lead">읽고 싶은 언어를 고르고, 오디오 소스를 정한 뒤 '시작'을 누르면 됩니다. 남은 번역 시간은 메인 화면에 바로 표시됩니다.</p>
${checkList([
  "인식하고 번역하는 언어 다섯 가지: 영어, 중국어(中文), 일본어(日本語), 한국어, 베트남어(Tiếng Việt)",
  "말하는 언어를 자동으로 감지하며, 어떤 언어로 말할지 알면 한 언어로 고정할 수 있습니다",
  "회의 앱을 떠나지 않고 자막을 시작하고, 표시하거나 숨기고, 잠그고, 스크롤하는 전역 단축키",
  "창을 닫아도 메뉴 막대 아이콘으로 앱이 계속 실행됩니다",
])}
</div>
</div>
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">입력 번역</span>
<h2>상대방의 언어로 답장하기</h2>
<p class="lead">쓰고 있는 채팅 입력란에서 ⌃⌥G(Windows: Ctrl+Alt+G)를 누르고, 내 언어로 입력한 뒤 Enter를 누르세요. 번역이 채팅 입력란에 붙여 넣어지면 확인하고 보내면 됩니다.</p>
${checkList([
  "붙여넣기(⌘V, Ctrl+V)가 되는 앱이라면 입력 중인 칸에 붙여 넣습니다",
  "번역은 내 컴퓨터에서 이루어지며, 입력한 내용이 밖으로 나가지 않습니다",
  "모든 요금제에 포함되며 번역 시간을 쓰지 않습니다",
])}
<p><a class="btn btn-secondary" href="/ko/guide/type-and-translate/">입력 번역 가이드 읽기 ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "ko", alt: "한국어 메시지와 그 아래 영어 번역이 있는 입력 번역 상자", caption: "입력 번역 상자: Enter를 누르면 번역이 채팅 입력란에 붙여 넣어집니다." })}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "AI Translator를 고르는 이유", title: "클라우드 도구와 다르게 작동하는 회의 번역", text: "많은 회의 번역 도구는 음성을 원격 서버에서 처리합니다. AI Translator는 그 반대로, 모든 것을 내 컴퓨터에서 처리합니다.", center: true })}
<div class="grid grid-3">
${feature({ icon: "shield", title: "설계부터 개인정보 보호", text: "음성은 RAM에만 있으며 디스크에 저장되거나 어디로도 전송되지 않습니다. 앱에는 사용 분석 기능이 없습니다. 오류가 생기면 개인 정보를 지운 오류 보고서를 보냅니다(설정에서 끌 수 있습니다).", accent: true })}
${feature({ icon: "wifi-off", title: "번역 중에는 오프라인", text: "음성 인식과 번역이 기기에서 실행되므로 연결이 불안정하거나 끊겨도 자막이 계속 나옵니다. 앱은 라이선스 확인처럼 몇 가지 일에만 가끔 인터넷이 필요합니다." })}
${feature({ icon: "video", title: "어떤 회의 앱이든, 봇 없이", text: "초대할 봇도, 설치할 플러그인도 없습니다. 컴퓨터에서 소리가 나는 것이라면 무엇이든 자막으로 만들 수 있습니다." })}
${feature({ icon: "book", title: "용어집", text: "사람 이름, 제품 이름, 업계 용어를 알려 주세요. 용어는 번역에 힌트로 전달됩니다(최대 500개, CSV 가져오기·내보내기 지원, Pro 기능)." })}
${feature({ icon: "history", title: "기록과 내보내기", text: "받아쓰기를 내 컴퓨터에 암호화해 저장하고 TXT, SRT, Markdown으로 내보낼 수 있습니다. 기록은 기본으로 꺼져 있어 직접 정할 수 있습니다(Pro 기능)." })}
${feature({ icon: "languages", title: "다섯 가지 언어", text: "영어, 중국어(中文), 일본어(日本語), 한국어, 베트남어(Tiếng Việt) 중 어떤 두 언어 사이든 번역합니다. 앞으로 더 많은 언어를 추가할 계획입니다. 앱 화면은 베트남어, 영어, 일본어, 중국어(간체), 한국어로 표시할 수 있습니다." })}
</div>
<div class="stats reveal">
<div class="stat"><b>&lt; 1.1초</b><span>화자가 문장을 마친 순간부터 번역 전체가 나타날 때까지의 지연 중앙값(Mac M4 Pro, Standard 팩)</span></div>
<div class="stat"><b>0</b><span>번역 중 외부로 전송된 음성이나 받아쓰기 데이터(macOS에서 네트워크 프록시로 확인)</span></div>
<div class="stat"><b>5시간 23분</b><span>macOS 내부 테스트에서 오류 없이 이어진 한 번의 연속 세션</span></div>
</div>
<p class="disclaimer">수치는 특정한 한 대(Mac M4 Pro, 24GB, macOS 26)에서 측정한 것입니다. 다른 컴퓨터는 더 느릴 수 있습니다. <a href="/ko/features/#performance">성능 상세와 측정 조건</a>을 참조하세요.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "활용", title: "어떤 언어의 대화든 따라갈 수 있습니다", center: true })}
<div class="grid grid-2">
${linkCard({ href: "/ko/solutions/online-meeting-translation/", icon: "users", title: "온라인 회의", text: "Zoom, Teams, Google Meet, Zalo PC에 번역 자막을. 다른 사람에게 무언가를 설치해 달라고 할 필요가 없습니다.", more: "솔루션 보기" })}
${linkCard({ href: "/ko/solutions/webinar-and-video-translation/", icon: "play", title: "웨비나와 동영상", text: "외국어 강연, 강좌, 동영상을 화면 위 번역 자막으로 따라갈 수 있습니다.", more: "솔루션 보기" })}
</div>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "요금", title: "간단한 요금제 네 가지, VietQR 또는 해외 카드로 선불", text: "자동 갱신도, 정기 결제도 없으며 자동으로 청구되는 일은 절대 없습니다.", center: true })}
${plansGrid("ko", { ctaLabel: "다운로드", freeLabel: "설치하고 무료로 써 보기" })}
<p class="disclaimer">VND 가격은 베트남 은행의 VietQR로, USD 가격은 해외 카드로 결제하며 세금 별도입니다(세금이 있는 경우).</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/ko/pricing/">요금제 자세히 비교하기 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${callout({ kind: "warn", title: "솔직하게 말씀드리는 것", text: "macOS 버전은 현재 애드혹 서명이며 공증(notarize)을 받지 않았습니다. 터미널 명령으로 설치하면 바로 열리지만, 브라우저로 내려받은 .dmg는 처음 실행할 때 macOS가 막으므로 시스템 설정에서 허용해야 합니다(<a href=\"/ko/guide/install-macos/\">단계별 설치 가이드</a>가 있습니다). Windows 버전은 아직 코드 서명이 되어 있지 않습니다. PowerShell 명령으로 설치하면 SmartScreen이 묻지 않지만, 브라우저로 내려받은 .exe는 경고가 나올 수 있고 차단 모드의 스마트 앱 컨트롤은 이를 차단합니다(<a href=\"/ko/guide/install-windows/\">Windows 설치 가이드</a> 참조). 또한 Windows의 지연은 내장 그래픽 노트북 한 대에서만 예비 테스트를 했으며 Mac M4 Pro보다 느립니다. 짐작하실 필요가 없도록 미리 말씀드립니다." })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "자주 묻는 질문", title: "먼저 알고 싶으실 내용" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/ko/faq/">모든 질문 보기 ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "모든 회의를 이해할 준비가 되셨나요?", text: "명령 한 줄로 설치하고(Mac은 터미널, Windows는 PowerShell) 10일 동안 무료로 써 보세요. 카드가 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/guide/quick-start/", label: "빠른 시작 가이드 읽기" } })}
`,
};
