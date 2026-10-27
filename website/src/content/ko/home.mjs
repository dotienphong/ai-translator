import { dataFlow, demo, demoVideo, feature, featureTabs, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_ITEMS = [
  { kind: "meeting", text: `영어로 말하는 동료의 발언에 한국어 자막이 표시됩니다. ${videoMeta("ko", "meeting").seconds}초 분량, 소리가 있는 영상입니다.`, label: "AI Translator 데모 영상: 회의 실시간 번역", fallback: "영상 내려받기(MP4, 1MB)" },
  { kind: "typing", text: `입력 번역이 한국어로 쓴 답장을 영어로 바꿔 채팅 입력란에 붙여 넣습니다. ${videoMeta("ko", "typing").seconds}초 분량, 소리가 있는 영상입니다.`, label: "AI Translator 데모 영상: 입력 번역", fallback: "영상 내려받기(MP4, 1MB)" },
];
const [MEETING_VIDEO, TYPING_VIDEO] = VIDEO_ITEMS;

export const HOME_FAQ = [
  {
    q: "Zoom, Teams, Google Meet, Zalo에서 쓸 수 있나요?",
    a: `<p>네. 봇이나 플러그인이 필요 없습니다. 앱이 컴퓨터의 시스템 오디오를 가져오므로 어떤 회의 앱을 쓰든 상관없습니다. macOS에서 Zoom, Google Meet, Microsoft Teams, Zalo PC의 오디오 캡처를 테스트했습니다(내부 테스트이며 해당 회사의 인증이 아닙니다). 다른 참가자에게는 알림이 가지 않으므로, 규정상 알려야 한다면 직접 알려 주세요.</p>`,
  },
  {
    q: "AI Translator를 쓰려면 인터넷 연결이 필요한가요?",
    a: `<p>번역하는 동안에는 필요 없습니다. 음성 인식, 번역, 자막 표시는 모두 내 컴퓨터에서 이루어집니다. 인터넷이 필요한 경우는 처음에 앱과 모델(약 1.3GB 또는 2.5GB)을 내려받을 때, 무료 체험을 등록할 때, 요금제를 구매할 때, 라이선스를 확인할 때(유료 요금제는 확인 사이에 최대 14일 동안 오프라인으로 사용할 수 있습니다), 그리고 앱을 업데이트할 때뿐입니다.</p>`,
  },
  {
    q: "회의 음성이 어딘가로 전송되나요?",
    a: `<p>아니요. 번역하는 동안 음성은 메모리(RAM)에만 있고, 디스크에 저장되거나 네트워크로 전송되지 않습니다. macOS에서 네트워크 프록시로 확인한 결과, 번역 중에 앱이 외부로 보낸 음성이나 받아쓰기 텍스트는 없었습니다.</p>`,
  },
  {
    q: "라이브 방송을 내 언어로 번역할 수 있나요?",
    a: `<p>컴퓨터에서는 가능합니다. 앱은 컴퓨터에서 재생되는 오디오를 들으므로 웹사이트에 좌우되지 않습니다. YouTube 라이브로 한 번 테스트했습니다(영어 뉴스 채널, macOS의 Chrome, 2026년 10월 25일). 테스트하는 동안 베트남어 자막이 계속 표시되었습니다. TikTok 라이브의 경우 배경 음악이 흐르는 베트남어 라이브 방송 한 건의 결과만 있습니다. 앱은 소리를 가져왔지만 언어를 잘못 인식하고 아무도 하지 않은 문장을 되풀이해서 자막을 쓸 만한 수준이 아니었습니다. Facebook 라이브에서는 테스트하지 않았습니다. 휴대폰 버전은 없으며, 앱이 내 라이브 방송에 시청자를 위한 자막을 더하지도 않습니다. <a href="/ko/solutions/livestream-translation/">라이브 방송 번역</a>을 참고하세요.</p>`,
  },
  {
    q: "회의 번역 자막을 무료로 받을 수 있나요?",
    a: `<p>AI Translator에는 하루 최대 30분까지 번역할 수 있는 10일 무료 체험이 있으며, 카드도 계정도 필요 없습니다. 다만 체험판이며 계속 무료로 쓰는 요금제가 아닙니다. 그 후에는 선불 요금제가 필요합니다: Monthly 50,000 ₫, 6 Months 269,000 ₫, Yearly 500,000 ₫.</p>`,
  },
  {
    q: "베트남 밖에서도 결제할 수 있나요?",
    a: `<p>네. 베트남 은행에서 VND로 하는 VietQR 계좌 이체 외에도, 앱의 업그레이드 화면에서 Creem 결제 페이지를 통해 해외 카드로 미국 달러로 결제할 수 있습니다: Monthly US$3.99, 6 Months US$21.99, Yearly US$39.99(세금 별도). Creem 목록에 있는 일부 국가에서는 카드를 사용할 수 없습니다. Free 체험에는 결제 수단이 필요 없습니다.</p>`,
  },
];

export default {
  id: "home",
  lang: "ko",
  path: "/ko/",
  title: "라이브·회의 실시간 번역 자막, 오프라인 | AI Translator",
  description:
    "라이브 방송, 동영상, Zoom·Teams·Meet 회의에 실시간 번역 자막. 영어·중국어·일본어·한국어·베트남어 지원. AI가 내 컴퓨터에서 실행되며 클라우드를 쓰지 않습니다.",
  software: true,
  modified: "2026-10-27",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    ...VIDEO_ITEMS.map((v) => videoObject({ lang: "ko", kind: v.kind, name: v.label, description: v.text, uploadDate: "2026-10-26" })),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS(Apple 실리콘) · Windows 10/11 · 10일 무료 체험</p>
<h1 class="reveal"><em>모든 회의</em>에 AI 번역 자막을, 내 컴퓨터에서</h1>
<p class="lead reveal"><strong>AI Translator</strong>는 macOS와 Windows용 AI 실시간 번역 데스크톱 앱입니다. 컴퓨터에서 재생되는 소리를 실시간으로 화면 위에 떠 있는 번역 자막으로 바꾸고, 내가 입력한 메시지를 상대방의 언어로 번역합니다. AI가 내 컴퓨터에서 실행되므로 음성과 회의 내용이 클라우드로 전송되지 않습니다. Zoom, Microsoft Teams, Google Meet, Zalo PC, 웨비나, 동영상, 컴퓨터로 보는 라이브 방송에서 쓸 수 있습니다.</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/ko/download/">다운로드 ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-to-use">사용법 보기</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI가 100% 기기에서 실행</li>
<li>${icon("check")} 회의 데이터는 클라우드로 가지 않음</li>
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

<section class="section" id="main-features"><div class="container">
${sectionHead({ eyebrow: "주요 기능", title: "회의 번역, 입력 번역, 기록", center: true })}
${featureTabs({
  listLabel: "기능 선택",
  tabs: [
    {
      id: "meeting-translation",
      icon: "captions",
      label: "회의 번역",
      title: "외국어 회의를 내 언어 자막으로 읽기",
      lead: "컴퓨터에서 재생되는 소리를 듣고 번역을 떠 있는 자막 바에 보여 줍니다. 회의에 봇이 참가하지 않습니다.",
      bullets: [
        "다섯 가지 언어 중 어떤 두 언어 사이든 번역: 영어, 중국어, 일본어, 한국어, 베트남어. 말하는 언어는 자동으로 감지합니다",
        `화자가 문장을 마치면 자막이 나타납니다. Mac M4 Pro(Standard 모델 팩)에서 중앙값은 1.1초 미만이며, 다른 컴퓨터는 더 느릴 수 있습니다(<a href="/ko/features/#performance">측정 조건</a>)`,
        `Zoom, Teams, Meet, Zalo에서 쓸 수 있습니다. 대면 회의는 입력 소스를 <strong>마이크</strong>로 고르세요(<a href="/ko/features/#microphone">사용 방법</a>). 컴퓨터로 보는 라이브 방송에도 쓸 수 있습니다(<a href="/ko/solutions/livestream-translation/">라이브 방송 번역</a>)`,
      ],
      cta: { href: "/ko/features/", label: "모든 기능 보기" },
      media: demoVideo({ lang: "ko", kind: MEETING_VIDEO.kind, label: MEETING_VIDEO.label, fallback: MEETING_VIDEO.fallback }),
    },
    {
      id: "type-and-translate",
      icon: "keyboard",
      label: "입력 번역",
      title: "상대방의 언어로 답장하기",
      lead: "쓰고 있는 채팅 입력란에서 ⌃⌥G(Windows: Ctrl+Alt+G)를 누르고, 내 언어로 입력한 뒤 Enter를 누르세요. 번역이 채팅 입력란에 붙여 넣어지면 확인하고 보내면 됩니다.",
      bullets: [
        "붙여넣기(⌘V, Ctrl+V)가 되는 앱이라면 입력 중인 칸에 붙여 넣습니다",
        "번역은 내 컴퓨터에서 이루어지며, 입력한 내용이 밖으로 나가지 않습니다",
        "모든 요금제에 포함되며 번역 시간을 쓰지 않습니다",
      ],
      cta: { href: "/ko/guide/type-and-translate/", label: "입력 번역 가이드 읽기" },
      media: demoVideo({ lang: "ko", kind: TYPING_VIDEO.kind, label: TYPING_VIDEO.label, fallback: TYPING_VIDEO.fallback }),
    },
    {
      id: "history",
      icon: "history",
      label: "기록",
      title: "회의가 끝난 뒤 다시 보기",
      lead: "세션마다 각 문장의 시간, 원문, 번역이 담긴 대본이 남습니다.",
      bullets: [
        "모든 요금제: 최근 세션의 대본을 보고, 검색하고, 복사",
        "Pro 기능: 세션 기록을 저장하고, 지난 세션을 다시 열고, TXT, SRT, Markdown으로 내보내기",
        "기록 저장은 기본으로 꺼져 있으며, 켜면 암호화되어 내 컴퓨터에만 저장됩니다",
      ],
      cta: { href: "/ko/guide/history-and-export/", label: "기록 가이드 읽기" },
      media: appShot({ slug: "app-history", lang: "ko", alt: "기록 화면: 저장된 세션 목록과 날짜와 시간, 분, 문장 수, 미리보기, 열기 및 삭제 버튼", caption: "기록: 내 컴퓨터에 저장된 세션." }),
    },
  ],
})}
</div></section>

<section class="section section-alt" id="how-to-use"><div class="container">
${sectionHead({ eyebrow: "사용법", title: "네 단계로 시작하기", text: "설치와 설정은 한 번만. 그다음부터는 회의마다 '시작'만 누르면 됩니다.", center: true })}
<div class="split wide-left">
${steps([
  { title: "명령 한 줄로 설치", text: `<a href="/ko/download/">다운로드 페이지</a>의 명령을 터미널(macOS) 또는 PowerShell(Windows)에 붙여 넣으세요.` },
  { title: "처음 설정하기", text: "언어를 고르고, 모델을 내려받은 다음(약 1.3GB 또는 2.5GB), 시스템 오디오 녹음을 허용하세요(macOS만)." },
  { title: "회의에서 '시작' 누르기", text: "<strong>번역 언어</strong>에서 언어를 고르고 <strong>시작</strong>을 누르세요(단축키 ⌃⌥T, Windows: Ctrl+Alt+T)." },
  { title: "답장하고 다시 보기", text: "⌃⌥G(Windows: Ctrl+Alt+G)로 입력 번역을 쓰세요. 회의가 끝나면 <strong>대본</strong> 또는 <strong>기록</strong>을 엽니다." },
], true)}
${appShot({ slug: "app-home-running", lang: "ko", alt: "세션 중인 AI Translator 메인 화면: 번역 중 상태, 언어, 오디오 소스, 남은 번역 시간", caption: "세션 중인 메인 화면(Monthly 요금제)." })}
</div>
<p class="disclaimer">macOS 버전은 애드혹 서명이며 공증(notarize)을 받지 않았고, Windows 버전은 아직 코드 서명이 되어 있지 않습니다. 명령으로 설치하면 macOS에서는 앱이 바로 열리고 SmartScreen도 묻지 않습니다. 브라우저로 내려받은 파일은 처음 실행할 때 막히거나 경고가 나올 수 있습니다. <a href="/ko/guide/install-macos/">macOS</a>와 <a href="/ko/guide/install-windows/">Windows</a> 설치 가이드를 참조하세요.</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/ko/guide/quick-start/">빠른 시작 가이드 읽기 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "데이터는 내 컴퓨터에 남습니다", title: "AI가 내 컴퓨터에서 실행되므로 회의 내용이 밖으로 나가지 않습니다", center: true })}
${dataFlow("ko")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "음성은 컴퓨터 밖으로 나가지 않음", text: "음성은 RAM에만 있으며 디스크에 저장되거나 네트워크로 전송되지 않습니다. macOS에서 네트워크 프록시로 확인했습니다. 연결이 끊겨도 자막이 계속 나옵니다.", accent: true })}
${feature({ icon: "shield", title: "서버에 회의 내용 없음", text: "서버는 요금제 판매, 기기 활성화, 지원에 필요한 데이터만 저장하며(자세한 내용은 아래), 회의 내용은 저장하지 않습니다." })}
</div>
<details class="more-details reveal"><summary>서버는 정확히 무엇을 저장하나요?</summary><p>서버에는 이메일(구매 시, 또는 지원 채팅에 직접 남겼을 때), 주문, 라이선스, 기기 활성화 정보(해시 처리한 기기 ID와 기기 이름), Free 체험 시작 시점(해시 처리한 기기 ID), 라이선스 변경 기록, 개인 정보를 지운 오류 보고서(30일 보관), 채팅을 쓴 경우의 지원 채팅 메시지(90일 보관)만 저장하며, 회의 내용은 절대 저장하지 않습니다.</p></details>
<p class="center-text reveal"><a class="btn btn-secondary" href="/ko/data-security/">데이터가 어디로 가는지 자세히 보기 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "요금", title: "간단한 요금제 네 가지, VietQR 또는 해외 카드로 선불", text: "자동 갱신도, 정기 결제도 없으며 자동으로 청구되는 일은 절대 없습니다.", center: true })}
${plansGrid("ko", { ctaLabel: "다운로드", freeLabel: "설치하고 무료로 써 보기" })}
<p class="disclaimer">VND 가격은 베트남 은행의 VietQR로, USD 가격은 해외 카드로 결제하며 세금 별도입니다(세금이 있는 경우).</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/ko/pricing/">요금제 자세히 비교하기 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "자주 묻는 질문", title: "먼저 알고 싶으실 내용" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/ko/faq/">모든 질문 보기 ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "모든 회의를 이해할 준비가 되셨나요?", text: "명령 한 줄로 설치하고(Mac은 터미널, Windows는 PowerShell) 10일 동안 무료로 써 보세요. 카드가 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/guide/quick-start/", label: "빠른 시작 가이드 읽기" } })}
`,
};
