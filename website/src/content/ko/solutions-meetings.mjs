import { pageHero, sectionHead, checkList, callout, ctaBand, appShot, overlayShot, facts, keys, steps, linkCard } from "../../build/components.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "솔루션", path: "/ko/solutions/" },
  { name: "온라인 회의", path: "/ko/solutions/online-meeting-translation/" },
];

export default {
  id: "solutions-meetings",
  lang: "ko",
  path: "/ko/solutions/online-meeting-translation/",
  title: "AI Translator: Zoom·Teams·Meet·Zalo 번역",
  description:
    "AI Translator로 Zoom, Teams, Google Meet, Zalo 통화에서 실시간 번역 자막을 읽으세요. 봇 없이 오프라인으로 작동합니다. 설정 팁과 솔직한 한계.",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-24",
  body: () => `
${pageHero({
  crumbs,
  title: "온라인 회의 번역 자막(Zoom, Teams, Meet, Zalo)",
  lead: "AI Translator는 컴퓨터에서 재생되는 오디오를 들어 Zoom, Microsoft Teams, Google Meet, Zalo PC 통화에 실시간 번역 자막을 표시합니다. 초대할 봇도 없고, 주최자가 켜야 할 것도 없으며, 음성 인식과 번역 모두 사용자의 기기에서 실행됩니다.",
  meta: "<span>업데이트 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["지원 앱", "Zoom, Microsoft Teams, Google Meet, Zalo PC<small>봇도 플러그인도 필요 없음. 컴퓨터로 소리를 내는 앱이라면 무엇이든 캡처할 수 있습니다</small>"],
  ["언어", "영어, 중국어, 일본어, 한국어, 베트남어<small>자막은 한 방향으로, 고른 언어로 번역됩니다</small>"],
  ["지연", "중앙값 0.76~1.03초<small>Mac M4 Pro, Standard 팩. 성능이 낮은 기기에서는 더 느립니다</small>"],
  ["플랫폼", "macOS 14.2 이상(Apple 실리콘)과 Windows 10/11 x64<small>Windows 버전은 아직 코드 서명되지 않아 설치할 때 SmartScreen이 경고할 수 있습니다</small>"],
])}</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "문제", title: "외국어 회의는 왜 이렇게 피곤할까요?" })}
<p>외국어로 진행되는 회의에서는 들으면서 동시에 머릿속으로 번역해야 해서, 누군가 빨리 말하거나 전문 용어를 많이 쓰면 요점을 놓치기 쉽습니다. 대형 회의 플랫폼은 번역 자막을 내장하고 있지만, 보통 상위 유료 요금제에 포함되며 오디오를 클라우드에서 처리합니다. 많은 타사 도구도 클라우드에서 작동합니다. 조직의 요금제에 그 기능이 없거나, 회의 오디오가 컴퓨터 밖으로 나가는 것을 원하지 않는다면 다른 방법이 필요합니다.</p>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-home-running", lang: "ko", alt: "번역 중인 AI Translator 메인 화면: 번역 중 상태, 언어, 오디오 소스, 남은 번역 시간", caption: "번역 중인 메인 화면." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">작동 방식</span>
<h2>AI Translator는 듣는 사람 쪽에서 실행됩니다</h2>
${checkList([
  "컴퓨터에서 재생되는 소리를 캡처합니다(macOS에서는 <em>시스템 오디오 녹음</em>을 허용하며, 회의실에서 말하는 사람은 마이크를 입력 소스로 더하면 됩니다. <a href=\"/ko/guide/macos-audio-permission/\">권한 허용 방법</a> 참고)",
  "오디오를 문장으로 나눈 뒤, 기기에서 실행되는 모델로 음성을 인식하고 번역합니다",
  "번역은 떠 있는 자막 바에 표시되며, 자막 바는 회의 앱의 포커스를 빼앗지 않으므로 채팅 입력을 계속할 수 있습니다",
  "다른 사람은 아무것도 할 필요가 없습니다: 회의실에 봇이 들어오지 않고, 주최자가 자막을 켤 필요도 없습니다",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "회의 전에", title: "5분 준비", center: true })}
<div class="split wide-right">
<div>
${appShot({ slug: "app-settings-audio", lang: "ko", alt: "오디오 설정: 입력 소스는 ‘컴퓨터 오디오 + 마이크’, 오디오 소스(Zoom만), 마이크 선택, 마이크 소리를 낮춘다는 안내, ‘마이크 잡음 필터’ 스위치, 100 ms로 설정된 문장을 끝내는 정지 시간 슬라이더", caption: "설정 › 오디오: 시스템 전체 또는 앱 하나만 듣기." })}
</div>
<div>
${steps(
  [
    { title: "언어를 안다면 원본 언어를 고정하기", text: "언어 카드에서 <em>원본 언어</em>를 <em>자동 감지</em> 대신 회의 언어로 정합니다. 짧은 문장에서 언어를 잘못 짐작할 일이 줄어듭니다. 여러 언어가 오갈 예정이면 자동 감지를 그대로 두고, 나올 수 있는 언어에만 체크합니다." },
    { title: "고유 명사를 용어집에 추가하기(Pro)", text: "파트너 이름, 제품 이름, 약어를 원하는 번역과 함께 최대 500개까지 입력합니다. 번역기에 주는 힌트일 뿐 그대로 번역된다는 보장은 아닙니다. <a href=\"/ko/guide/glossary/\">용어집 가이드</a>를 참고하세요." },
    { title: "자막 바를 배치하고 잠그기", text: "말하는 사람을 가리지 않는 곳, 보통 영상 바로 아래로 끌어 놓습니다. 글자 크기(14~48 px), 색, 불투명도는 ‘설정 › 자막’에서 정합니다. <em>잠금(클릭 통과)</em>을 누르면 마우스가 바를 통과합니다." },
    { title: "Zoom 소리만 듣기(macOS)", text: "‘설정 › 오디오’의 목록에는 소리를 내는 앱만 표시되므로, 통화에 참가한 다음 <em>목록 새로 고침</em>을 누릅니다. Zoom 항목(<em>{앱 이름}만</em>으로 표시됨)을 고르면 알림음이나 다른 동영상은 번역되지 않습니다. 브라우저에서 Meet를 쓴다면 브라우저를 고릅니다(다른 탭의 소리도 들립니다). 다음 세션부터 적용됩니다." },
  ],
  true,
)}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "회의 중", title: "통화를 떠나지 않고 조작하기", text: "모델 로딩이 끝나도록 회의가 시작되기 전에 ‘시작’을 눌러 두세요(두 번째부터는 몇 초, 설치나 업데이트 직후 첫 실행은 더 오래 걸려 몇 분이 걸릴 수도 있습니다). 조용한 시간은 번역 시간에 포함되지 않습니다.", center: true })}
${overlayShot({ slug: "overlay-default", lang: "ko", alt: "원문을 위에 작은 글씨로, 그 아래 한국어 번역을 보여 주는 AI Translator 자막 바", caption: "자막 바: 위에는 작은 원문, 아래에는 번역." })}
<div class="split">
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">동작</th><th scope="col">macOS</th></tr></thead>
<tbody>
<tr><th scope="row">번역 시작 또는 중지</th><td>${keys(["⌃", "⌥", "T"])}</td></tr>
<tr><th scope="row">자막 표시 또는 숨기기</th><td>${keys(["⌃", "⌥", "H"])}</td></tr>
<tr><th scope="row">잠금 또는 잠금 해제</th><td>${keys(["⌃", "⌥", "L"])}</td></tr>
<tr><th scope="row">위로 스크롤(이전 문장)</th><td>${keys(["⌃", "⌥", "PageUp"])}</td></tr>
<tr><th scope="row">아래로 스크롤(새 문장)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td></tr>
</tbody></table></div>
<div class="stack reveal">
${checkList([
  "<strong>놓친 문장:</strong> 위로 스크롤해 다시 읽을 수 있습니다(최근 1000문장 보관). <em>최신</em> 버튼으로 돌아오며, 스크롤 키는 바가 잠겨 있어도 작동합니다.",
  "<strong>흐린 글자</strong>는 임시 자막으로, 말이 이어지면 바뀝니다. 이름과 숫자를 다시 확인할 수 있도록 <em>번역 위에 원문 표시</em>를 켜 두세요(기본값 켜짐).",
  "<strong>빨리 숨기려면</strong> 단축키를 쓰세요(번역은 계속됩니다). 잠기지 않은 바의 ✕ 버튼을 누르면 자막을 닫고 번역을 멈춥니다.",
])}
</div>
</div>
<p class="small muted">Windows에서는 단축키에 ⌃⌥ 대신 Ctrl+Alt를 씁니다. 회의 앱과 겹치면 ‘설정 › 단축키’에서 바꾸세요. 화면을 공유할 때 공유하는 영역에 자막 바가 보이는지는 확인하지 않았으니, 먼저 시험해 보거나 공유하는 동안 바를 숨기세요. <a href="/ko/guide/subtitle-bar-and-shortcuts/">자막 바와 단축키</a>를 참고하세요.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "회의 후", title: "필요한 것을 남기기" })}
<p><strong>중지</strong>를 누른 뒤 <strong>대본 열기</strong>를 누르면 모든 줄을 시간, 원문, 번역과 함께 볼 수 있습니다. 검색창(돋보기 아이콘)과 <em>모두 복사</em> 버튼은 모든 요금제에서 쓸 수 있습니다.</p>
<p>TXT, SRT, Markdown으로 내보내기와 기록은 Pro 기능입니다(<a href="/ko/pricing/">요금</a> 참고). 기록은 기본적으로 꺼져 있으며, ‘설정 › 개인정보 보호’에서 켜면 세션마다 컴퓨터에 암호화되어 저장됩니다. 앱이 스스로 대본을 디스크에 저장하지는 않으며, 이는 텍스트 대본이지 회의록이 아닙니다. <a href="/ko/guide/history-and-export/">기록과 내보내기</a>를 참고하세요.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "테스트한 내용", title: "지금까지 시험한 앱과 기기" })}
<p>별도의 오디오 캡처 테스트 도구(앱의 인식과 번역 전체 과정이 아님)를 사용해, macOS 26.6.2에서 <strong>Zoom(앱)</strong>, Chrome·Safari·Edge의 <strong>Google Meet</strong>, <strong>Microsoft Teams(새 앱)</strong>, <strong>Zalo PC</strong>의 시스템 오디오 캡처를 스피커, 유선 헤드폰, AirPods로 시험했습니다.</p>
<p>이는 내부 테스트이며, 시험한 사람이 귀로 확인했습니다. 앱과 macOS 버전(최소 14.2)마다 릴리스 빌드로 정식 인수 테스트를 한 것은 아닙니다.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "개인정보", title: "개인정보와 다른 참석자에게 알리기" })}
<p>AI Translator는 컴퓨터에서 재생되는 소리를 캡처하므로, 여기에는 다른 사람의 목소리도 포함됩니다. 오디오는 메모리에 머물며, 디스크에 쓰이지 않고 네트워크로 전송되지 않습니다(macOS에서 프록시로 확인했습니다). 앱은 회의를 녹음하지 않습니다. <a href="/ko/data-security/">데이터와 보안</a>을 참고하세요.</p>
${callout({ title: "다른 참석자에게는 알림이 가지 않습니다.", text: "봇이 없고 앱이 회의 플랫폼에 연결하지 않으므로, 다른 참석자에게는 사용자가 AI Translator를 쓰고 있다는 표시가 전혀 보이지 않습니다. 법이나 회사 규정상 필요하다면, 번역 도구를 쓰고 있다는 사실을 다른 참석자에게 알리는 것은 사용자의 책임입니다. <a href=\"/en/terms/\">이용 약관(영어)</a> 제6절에도 같은 내용이 있습니다. 저희는 법률 조언을 하지 않습니다." })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "솔직한 한계", title: "알아 두어야 할 것" })}
${checkList([
  "<strong>지연:</strong> 중앙값 0.76~1.03초, p90은 0.94~1.34초이며, 24GB Mac M4 Pro에서 Standard 팩으로 측정했습니다. 성능이 낮은 기기에서는 지연이 더 커집니다. M1 Mac에서는 측정하지 않았고, 내장 그래픽의 Windows 노트북 한 대에서는 Standard 팩이 목표에 미치지 못했습니다. <a href=\"/ko/features/\">측정 조건</a>을 참고하세요.",
  "<strong>품질은</strong> 언어와 오디오가 얼마나 또렷한지에 따라 달라집니다. 베트남어, 일본어, 한국어, 중국어에서는 Lite 팩이 Standard보다 받아쓰기 정확도가 낮습니다. 실제 블루투스 헤드셋을 거친 정확도는 측정하지 않았습니다.",
  "<strong>번역은 틀릴 수 있습니다.</strong> 특히 전문 용어와 고유 명사가 그렇습니다. 중요한 결정에는 전문가의 확인 없이 의존하지 마세요.",
], true)}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "계속 읽기", title: "다음 단계", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ko/guide/quick-start/", icon: "zap", title: "빠른 시작", text: "설치부터 첫 자막까지.", more: "가이드 열기" })}
${linkCard({ href: "/ko/compare/offline-vs-cloud-translation/", icon: "layers", title: "오프라인 번역과 클라우드 번역", text: "두 방식을 균형 있게 비교합니다.", more: "비교 읽기" })}
${linkCard({ href: "/ko/solutions/webinar-and-video-translation/", icon: "play", title: "웨비나와 동영상", text: "콘퍼런스 발표, 강좌, 강의.", more: "솔루션 보기" })}
</div>
</div></section>

${ctaBand({ title: "내 통화에서 직접 써 보세요", text: "10일 무료 체험으로 시작하세요. 하루 30분, 카드도 계정도 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/guide/quick-start/", label: "빠른 시작 가이드" } })}
`,
};
