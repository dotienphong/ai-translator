import { pageHero, sectionHead, feature, linkCard, checkList, callout, ctaBand, facts } from "../../build/components.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "솔루션", path: "/ko/solutions/" },
];

export default {
  id: "solutions",
  lang: "ko",
  path: "/ko/solutions/",
  title: "솔루션: 회의와 동영상 번역 자막",
  description:
    "AI Translator는 Zoom, Teams, Meet, Zalo 통화와 웨비나, 강좌, 동영상에 번역 자막을 표시합니다. 사용법과 맞지 않는 경우를 알아보세요.",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({ crumbs, title: "AI Translator는 어디에 쓸 수 있나요?", lead: "AI Translator는 컴퓨터에서 재생되는 모든 오디오에 실시간 번역 자막을 표시하며, 음성 인식과 번역 모두 사용자의 기기에서 실행됩니다. 주된 용도는 두 가지로, 온라인 회의, 그리고 모르는 언어로 된 웨비나, 강좌, 동영상 시청입니다. 이 페이지는 알맞은 설정을 고르도록 돕고, 앱이 맞지 않는 경우도 알려 드립니다." })}

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "두 가지 주요 용도", title: "가장 가까운 상황을 고르세요", center: true })}
<div class="grid grid-2">
${linkCard({ href: "/ko/solutions/online-meeting-translation/", icon: "users", title: "온라인 회의: Zoom, Teams, Meet, Zalo", text: "해외 파트너와의 통화에 번역 자막을. 봇도 필요 없고, 주최자에게 무언가를 켜 달라고 부탁할 필요도 없습니다. 통화 전 준비, 통화 중 단축키, 통화 후 대본까지 다룹니다.", more: "회의 솔루션 보기" })}
${linkCard({ href: "/ko/solutions/webinar-and-video-translation/", icon: "play", title: "웨비나, 강좌, 동영상", text: "다른 언어로 된 콘퍼런스 발표, 강좌, 동영상을 몇 시간짜리 세션이라도 번역 자막을 읽으며 보고, 나중에 대본을 복사하거나 내보내 다시 공부할 수 있습니다.", more: "웨비나와 동영상 솔루션 보기" })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "공통점", title: "어떤 상황에서도 같은 것", text: "회의 중이든 동영상을 보든, AI Translator는 같은 방식으로 작동합니다.", center: true })}
<div class="grid grid-2">
${feature({ icon: "speaker", title: "시스템 오디오를 듣습니다", text: "앱은 컴퓨터에서 재생되는 소리를 캡처하므로, 소리가 나는 모든 앱이나 웹 페이지에서 작동합니다. 봇도, 플러그인도, 회의나 동영상 플랫폼의 계정도 필요 없습니다." })}
${feature({ icon: "wifi-off", title: "번역하는 동안 오프라인", text: "음성 인식과 번역은 사용자의 기기에서 실행됩니다. 오디오는 메모리에 머물며, 디스크에 쓰이지 않고 어디로도 전송되지 않습니다. <a href=\"/ko/data-security/\">데이터와 보안</a>을 참고하세요." })}
${feature({ icon: "languages", title: "5개 언어", text: "영어, 중국어, 일본어, 한국어, 베트남어를 말하는 오디오와 번역 모두에서 지원합니다. 읽고 싶은 언어를 고르면 됩니다." })}
${feature({ icon: "captions", title: "떠 있는 자막 바", text: "항상 맨 위에 떠 있고, 사용 중인 앱의 포커스를 빼앗지 않는 바 하나. 끌어서 옮기고, 글자 크기를 바꾸고, 잠가서 마우스가 통과하게 할 수 있습니다. <a href=\"/ko/features/\">모든 기능</a>을 참고하세요." })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "시작하기 전에", title: "필요한 것", center: true })}
<div class="reveal">${facts([
  ["플랫폼", "Apple 실리콘의 macOS 14.2 이상과 Windows 10/11 x64<small>Intel Mac과 Windows ARM64: 지원하지 않음</small>"],
  ["컴퓨터", "RAM 최소 8GB, 16GB 권장<small>한 번만 받는 모델 다운로드: 1.3GB(Lite) 또는 2.5GB(Standard)</small>"],
  ["언어", "영어, 중국어, 일본어, 한국어, 베트남어<small>앱 인터페이스: 영어, 베트남어, 일본어, 중국어(간체), 한국어</small>"],
  ["요금", "10일 무료 체험 · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>VietQR 또는 해외 카드(USD)로 선불 결제, 자동 갱신 없음. Creem 목록에 따라 일부 국가에서는 카드를 받지 않습니다.</small>"],
])}</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "빠른 선택", title: "어떤 상황에 어떤 설정?" })}
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">상황</th><th scope="col">간단한 팁</th></tr></thead>
<tbody>
<tr><th scope="row">파트너와의 Zoom, Teams, Meet 통화</th><td>원본 언어를 고정하고, 고유 명사를 용어집에 추가하고(Pro), 자막 바를 영상 바로 아래에 둡니다</td></tr>
<tr><th scope="row">Zalo PC 통화</th><td>‘자동 감지’를 그대로 두거나, 언어를 안다면 고정합니다</td></tr>
<tr><th scope="row">웨비나나 콘퍼런스 발표</th><td>원문 표시를 그대로 두고(기본값 켜짐), 플레이어 소리만 듣게 합니다(macOS)</td></tr>
<tr><th scope="row">강좌나 강의 동영상</th><td>대본을 내보내 다시 공부하고(Pro), 분야별 용어를 용어집에 추가합니다(Pro)</td></tr>
</tbody></table></div>
</div></section>

<section class="section section-alt" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "솔직한 한계", title: "AI Translator가 맞지 않는 경우", text: "한계를 미리 알면 소득 없는 체험을 피할 수 있습니다." })}
${checkList([
  "<strong>번역된 내 목소리를 다른 사람이 들어야 한다.</strong> AI Translator의 자막은 한 방향으로만, 컴퓨터에서 재생되는 오디오를 사용자의 언어로 번역합니다. 사용자의 목소리를 번역해 회의에 내보내지는 않습니다. 글로 답할 때는 <a href=\"/ko/guide/type-and-translate/\">입력 번역</a>을 쓸 수 있습니다.",
  "<strong>회의를 녹음해야 한다.</strong> 앱은 오디오를 디스크에 녹음하지 않습니다. 텍스트 대본만 남기며, 기록 저장은 기본적으로 꺼져 있는 Pro 기능입니다.",
  "<strong>자동 회의록, 요약, 화자 구분이 필요하다.</strong> 지원하지 않습니다.",
  "<strong>Intel Mac, Windows ARM64, 또는 CPU가 AVX2를 지원하지 않는 Windows PC를 쓴다.</strong> AI Translator는 Apple 실리콘의 macOS 14.2 이상과, AVX2를 지원하는 CPU가 있는 Windows 10/11 64비트(x64)에서 실행됩니다.",
  "<strong>컴퓨터의 RAM이 8GB 미만이거나,</strong> 위 5개 언어 외의 언어가 필요하다: 앱이 아직 이를 지원하지 못합니다.",
  "<strong>베트남 은행 계좌가 없고, Creem이 카드 결제를 받지 않는 나라에 있다.</strong> 해외 카드는 Creem을 통해 결제되는데, Creem은 일부 국가의 구매자를 받지 않으며(Creem 목록 기준), PayPal도 없습니다. 이 경우 지금은 유료 요금제를 결제할 방법이 없으며, Free 체험은 쓸 수 있습니다.",
], true)}
${callout({ kind: "warn", title: "자동 번역은 틀릴 수 있습니다.", text: "중요한 결정(계약, 의료, 법률, 금융)에서는 전문가의 확인 없이 AI Translator에 의존하지 마세요." })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "계속 읽기", title: "더 자세히 알고 싶나요?", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ko/compare/offline-vs-cloud-translation/", icon: "layers", title: "오프라인 번역과 클라우드 번역", text: "개인정보, 비용, 지연, 하드웨어, 언제 무엇을 고를지 균형 있게 비교합니다.", more: "비교 읽기" })}
${linkCard({ href: "/ko/guide/quick-start/", icon: "zap", title: "빠른 시작", text: "설치부터 첫 자막까지, macOS 녹음 권한을 포함합니다.", more: "가이드 열기" })}
${linkCard({ href: "/ko/pricing/", icon: "wallet", title: "요금", text: "10일 무료 체험, Monthly 50,000 ₫, 6 Months 269,000 ₫, Yearly 500,000 ₫.", more: "요금 보기" })}
</div>
</div></section>

${ctaBand({ title: "내 통화나 동영상에서 직접 써 보세요", text: "10일 무료 체험으로 시작하세요. 하루 30분, 카드도 계정도 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/pricing/", label: "요금 보기" } })}
`,
};
