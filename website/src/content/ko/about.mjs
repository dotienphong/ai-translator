import { RELEASE } from "../../site.mjs";
import { pageHero, sectionHead, feature, linkCard, callout, facts, ctaBand } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";
import { legalVersionLine } from "../legal.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "AI Translator 소개", path: "/ko/about/" },
];

const MAIL = `<a href="mailto:${SITE.email}">${SITE.email}</a>`;

export default {
  id: "about",
  lang: "ko",
  path: "/ko/about/",
  title: "AI Translator 소개: 시작, 원칙, 개발자",
  description:
    "AI Translator는 회의 실시간 번역 자막을 오프라인으로 보여 주는 앱으로, 개인 개발자 Đỗ Tiến Phong이 만들고 있습니다. 시작된 계기, 원칙, 현재 상황을 소개합니다.",
  schemaType: "AboutPage",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator 소개: 내 컴퓨터에서 회의를 번역합니다",
  lead: "AI Translator는 회의 오디오에 실시간 번역 자막을 보여 주며 내 컴퓨터에서 오프라인으로 실행되는 데스크톱 앱입니다. 개인 개발자 Đỗ Tiến Phong이 만들고 운영합니다. macOS와 Windows에서 쓸 수 있습니다.",
  meta: "<span>업데이트 {{updated}}</span><span>제공자: Đỗ Tiến Phong</span>",
})}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["제품", "회의, 웨비나, 동영상을 위한 실시간 번역 자막<small>음성 인식과 번역이 내 컴퓨터에서 실행</small>"],
  ["제공자", "Đỗ Tiến Phong(개인)<small>개인 개발자</small>"],
  ["상태", `${RELEASE.ko}<small>macOS 14.2 이상(Apple 실리콘)과 Windows 10/11 64비트</small>`],
  ["지원", `${MAIL}<small>베트남어나 영어로 문의하실 수 있습니다</small>`],
  ["언어", "영어, 중국어(中文), 일본어(日本語), 한국어, 베트남어(Tiếng Việt)<small>앱 화면은 베트남어, 영어, 일본어, 중국어(간체), 한국어</small>"],
  ["라이선스", "상용 제품이며 오픈 소스가 아닙니다<small>서드파티의 오픈 소스 구성 요소를 사용</small>"],
])}</div>
</div></section>

<section class="section" id="story"><div class="container narrow">
${sectionHead({ eyebrow: "이야기", title: "AI Translator가 생긴 이유" })}
<div class="prose">
<p>처음 생각은 기존 Android용 오프라인 번역 앱(오픈 소스)을 통화와 회의에 쓰는 것이었습니다. 하지만 거의 곧바로 운영체제의 단단한 제약에 부딪혔습니다. Android는 서드파티 앱이 미디어와 게임의 오디오는 가져올 수 있게 하지만, 전화나 VoIP 통화의 오디오는 가져올 수 없게 하며, 통화 중에는 앱의 마이크에도 대개 무음만 들립니다.</p>
<p>컴퓨터는 다릅니다. Windows와 macOS(14.2부터) 모두 앱이 컴퓨터 자신이 재생하는 소리를 가져올 수 있는 방법을 제공합니다. 그래서 프로젝트는 데스크톱으로 옮겨 갔습니다. 시스템 오디오를 듣고, 음성을 인식하고 번역해 자막을 보여 주며, 봇이나 플러그인 없이 어떤 회의 앱에서든 작동하는 앱입니다.</p>
<p>조사했을 때(2026년 9월) 대형 회의 앱의 번역 자막은 상위 유료 등급에 있고 클라우드에서 실행되는 경우가 많았으며, 많은 서드파티 도구도 마찬가지였습니다. 저희는 다른 선택지를 만들고 싶었습니다. 모든 것을 내 컴퓨터에서 처리하고, 어떤 회의 앱에서든 쓸 수 있고, 베트남어에 집중하며, 서버가 번역하지 않으니 쓰는 시간마다 인프라 비용이 늘지 않는 선택지입니다. <a href="/ko/compare/offline-vs-cloud-translation/">오프라인 번역과 클라우드 번역 비교</a>도 있습니다.</p>
<p>번역 모델은 측정을 통해 골랐습니다. 2026년 9월 29일의 내부 테스트(텍스트 320문장, 번역 방향 다섯 개, Mac M4 Pro에서 실행)에서 고른 모델은 자동 번역 품질 점수 0.837을 받았고, 같은 조건에서 테스트한 다른 번역 모델 세 개는 0.736~0.833이었습니다. 이 테스트는 실제 음성이 아니라 텍스트로 했으며, 클라우드 서비스와는 비교하지 않았습니다.</p>
</div>
</div></section>

<section class="section section-alt" id="principles"><div class="container">
${sectionHead({ eyebrow: "원칙", title: "제품을 만들 때 지키는 여섯 가지", center: true })}
<div class="grid grid-3">
${feature({ icon: "shield", title: "설계부터 개인정보 보호", text: "음성은 RAM에 머물며 디스크에 저장되거나 어디로도 전송되지 않습니다. 서버에는 라이선스, 주문, 체험, 오류 보고서에 필요한 것만 남깁니다. 자세한 내용은 <a href=\"/ko/data-security/\">데이터와 보안</a>에 있습니다.", accent: true })}
${feature({ icon: "wifi-off", title: "번역 중에는 오프라인", text: "음성 인식과 번역은 내 컴퓨터에서 실행됩니다. 인터넷은 모델 다운로드, 체험 등록, 라이선스 구매와 확인, 앱 업데이트에만 필요합니다." })}
${feature({ icon: "info", title: "상태를 솔직하게", text: "아직 못 한 일은 아직이라고 말합니다. macOS는 아직 공증을 받지 않았고, Windows는 아직 코드 서명이 없으며, 측정하지 않은 기기도 있습니다. 웹사이트와 앱에서 있는 그대로 말씀드립니다." })}
${feature({ icon: "lock", title: "광고 없음, 사용 분석 없음", text: "앱에는 광고도 사용 분석도 없습니다. 오류가 생기면 문제를 고치기 위해 개인 정보를 지운 오류 보고서(음성과 회의 내용 없음)를 보내며, 설정에서 끌 수 있습니다. 저희 수입은 여러분의 데이터가 아니라 유료 요금제에서 나옵니다." })}
${feature({ icon: "video", title: "봇 없음, 계정 없음", text: "회의에 봇이 참가하지 않고, 설치할 플러그인도, 로그인도 없습니다. 유료 요금제는 이메일로 받는 라이선스 키로 활성화합니다." })}
${feature({ icon: "gauge", title: "숫자에는 조건을 함께", text: "이 웹사이트의 모든 속도나 품질 수치에는 측정한 기기와 조건을 함께 적습니다. 측정하지 않은 것은 측정하지 않았다고 말합니다. <a href=\"/ko/features/#performance\">기능과 성능</a>을 참조하세요." })}
</div>
</div></section>

<section class="section" id="who"><div class="container narrow">
${sectionHead({ eyebrow: "만드는 사람", title: "AI Translator는 누가 만드나요?" })}
<div class="prose">
<p>AI Translator는 데스크톱 앱부터 라이선스 서버까지 개인 개발자 <strong>Đỗ Tiến Phong</strong>이 개발하고 운영합니다. 이 웹사이트에서는 간결하게 '저희'라고 쓰지만, 한 사람이 만드는 제품입니다.</p>
<p>여기에는 긴 약력, 사용 후기, 고객 로고를 싣지 않습니다. 확인할 수 있는 것만 싣습니다: 조건이 붙은 측정값, 알려진 한계, 명확한 약관. 질문, 의견, 버그 보고는 ${MAIL}으로 보내 주세요. <a href="/ko/contact/">문의 페이지</a>도 참조하세요.</p>
</div>
</div></section>

<section class="section section-alt" id="status"><div class="container narrow">
${sectionHead({ eyebrow: "현재", title: "AI Translator는 지금 어디쯤 와 있나요?" })}
<div class="table-wrap reveal" role="region" aria-label="AI Translator의 현재 상태" tabindex="0"><table>
<thead><tr><th scope="col">영역</th><th scope="col">상태</th></tr></thead>
<tbody>
<tr><th scope="row">macOS</th><td>macOS 14.2 이상, Apple 실리콘. <a href="/ko/download/#install-macos">터미널에서 명령 한 줄로 설치</a>.</td></tr>
<tr><th scope="row">Windows</th><td>Windows 10/11 64비트(x64). <a href="/ko/download/#install-windows">PowerShell에서 명령 한 줄로 설치</a>. Windows의 지연은 내장 그래픽 노트북 한 대에서만 예비 테스트를 했습니다(Mac M4 Pro보다 느림).</td></tr>
<tr><th scope="row">코드 서명</th><td>macOS는 애드혹 서명이며 공증을 받지 않았습니다. 명령으로 설치하면 바로 열리지만, 브라우저로 내려받은 .dmg는 처음 실행할 때 '확인 없이 열기'가 필요합니다. Windows는 아직 코드 서명 인증서가 없습니다. 명령으로 설치하면 SmartScreen이 묻지 않지만, 브라우저로 내려받은 .exe는 경고가 나올 수 있습니다(차단 모드의 스마트 앱 컨트롤은 둘 다 차단합니다)(<a href="/ko/guide/install-windows/">대처 방법</a>).</td></tr>
<tr><th scope="row">결제</th><td>PayOS를 통한 VND VietQR, 또는 Creem을 통한 USD 해외 카드. VietQR 주문에는 아직 베트남 전자 세금계산서가 없고, 카드 주문에는 Creem이 영수증을 보냅니다.</td></tr>
<tr><th scope="row">요금제</th><td>10일 무료 체험, Monthly, 6 Months, Yearly. <a href="/ko/pricing/">요금</a>을 참조하세요.</td></tr>
</tbody></table></div>
</div></section>

<section class="section" id="under-consideration"><div class="container narrow">
${sectionHead({ eyebrow: "앞으로", title: "검토하고 있는 것" })}
${callout({ kind: "warn", title: "이것은 약속이 아닙니다.", text: "아래 목록은 다음 단계를 위해 검토하고 있는 것입니다. 날짜도 정해진 순서도 없으며, 사용자 의견에 따라 어떤 항목이든 바뀌거나 빠질 수 있습니다." })}
<div class="prose">
<ul>
<li>자막에서 화자 구분하기</li>
<li>Windows ARM64 지원</li>
<li>Windows에서 앱별 오디오 캡처</li>
<li>양방향 음성 번역: 내 목소리를 회의의 다른 사람들에게 번역</li>
<li>회의 요약과 회의록</li>
<li>여러 기기를 위한 비즈니스 요금제</li>
<li>원본 음성과 번역 언어 추가(현재 다섯 가지 외)</li>
<li>화면 언어 추가</li>
</ul>
<p>순서는 사용자 의견에 따라 정해지니, 가장 필요한 것을 <a href="/ko/contact/">문의 페이지</a>로 알려 주세요.</p>
</div>
</div></section>

<section class="section section-alt" id="technology"><div class="container narrow">
${sectionHead({ eyebrow: "라이선스", title: "서드파티 오픈 소스 구성 요소", text: "AI Translator는 상용 제품이며 오픈 소스가 아닙니다. 사용권 계약은 복제, 리버스 엔지니어링, 브랜드 변경을 허용하지 않습니다. 하지만 서드파티의 오픈 소스 구성 요소를 많이 쓰고 있으며, 그 출처를 밝힙니다." })}
<p class="small muted">원본 모델은 수정하지 않고 라이선스와 함께 재배포합니다. 구성 요소와 라이선스 전체 목록은 앱 안의 '정보 › 오픈 소스 라이선스'에 있습니다. Zoom, Microsoft Teams, Google Meet, Zalo는 호환성을 설명하기 위해서만 언급하며, AI Translator는 이 회사들과 제휴 관계가 없습니다.</p>
</div></section>

<section class="section" id="legal"><div class="container narrow">
${sectionHead({ eyebrow: "법률 정보", title: "간단한 법률 정보" })}
<div class="reveal">${facts([
  ["제공자", "Đỗ Tiến Phong(개인)"],
  ["브랜드", "AI Translator"],
  ["준거법", "베트남 법<small>분쟁은 베트남의 관할 법원에서 다룹니다(이용약관 제14조)</small>"],
  ["이용약관", `<a href="/en/terms/">사용권 계약(EULA, 영어)</a><small><span lang="en">${legalVersionLine("eula.en.md")}</span></small>`],
  ["개인정보", `<a href="/en/privacy/">개인정보 처리방침(영어)</a><small><span lang="en">${legalVersionLine("privacy.en.md")}</span></small>`],
  ["문서 언어", "베트남어판이 원본이며 우선합니다<small>영어판은 참고용 번역이며, 한국어판은 없습니다</small>"],
  ["개인 데이터 관련 문의", MAIL],
])}</div>
</div></section>

<section class="section-tight"><div class="container">
<h2 class="sr-only">계속 읽기</h2>
<div class="grid grid-3">
${linkCard({ href: "/ko/features/", icon: "captions", title: "기능", text: "AI Translator가 지금 할 수 있는 일을 앱에서 작동하는 그대로.", more: "기능 보기" })}
${linkCard({ href: "/ko/data-security/", icon: "shield", title: "데이터와 보안", text: "내 컴퓨터에 남는 것, 앱이 연결하는 곳, 서버가 저장하는 것.", more: "자세히 읽기" })}
${linkCard({ href: "/ko/pricing/", icon: "wallet", title: "요금", text: "10일 무료 체험, Monthly 50,000 ₫, 6 Months 269,000 ₫, Yearly 500,000 ₫.", more: "요금 보기" })}
</div>
</div></section>

${ctaBand({ title: "실제 회의에서 써 보세요", text: "macOS나 Windows에 명령 한 줄로 설치하고 10일 Free 체험을 쓰세요. 카드도 계정도 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/contact/", label: "문의하기" } })}
`,
};
