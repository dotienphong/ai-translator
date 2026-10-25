import { pageHero, sectionHead, feature, checkList, callout, ctaBand, appShot, overlayShot, facts, linkCard } from "../../build/components.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "솔루션", path: "/ko/solutions/" },
  { name: "웨비나와 동영상", path: "/ko/solutions/webinar-and-video-translation/" },
];

export default {
  id: "solutions-webinar",
  lang: "ko",
  path: "/ko/solutions/webinar-and-video-translation/",
  title: "웨비나, 강좌, 동영상 번역 자막",
  description:
    "AI Translator로 다른 언어의 웨비나, 강좌, 동영상을 실시간 번역 자막과 함께 보세요. 브라우저에 따로 설치할 것이 없고 오프라인으로 작동합니다.",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  body: () => `
${pageHero({
  crumbs,
  title: "웨비나, 강좌, 동영상을 위한 번역 자막",
  lead: "AI Translator는 다른 언어로 된 웨비나, 온라인 콘퍼런스, 강좌, 동영상을 보는 동안 화면에 번역 자막을 표시합니다. 컴퓨터에서 재생되는 오디오를 들으므로 브라우저나 플랫폼에 설치할 것이 없고, 인식과 번역 모두 사용자의 기기에서 실행됩니다.",
  meta: "<span>업데이트 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["지원 대상", "컴퓨터에서 소리가 나는 모든 것<small>브라우저, 미디어 플레이어, 강좌 플랫폼, 웨비나 도구</small>"],
  ["추가 설치", "앱 외에는 필요 없음<small>브라우저 확장 프로그램도, 플러그인도, 로그인 계정도 필요 없음</small>"],
  ["언어", "영어, 중국어, 일본어, 한국어, 베트남어<small>읽고 싶은 언어를 고르면 됩니다</small>"],
  ["긴 세션", "5시간 23분 동안 오류 없이 실행<small>Mac M4 Pro, macOS, 애드혹 서명 릴리스 빌드, 1회 테스트</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "이런 분께", title: "내용은 훌륭한데 내 언어가 아닐 때", center: true })}
<div class="grid grid-3">
${feature({ icon: "book", title: "온라인 학습자", text: "영어, 중국어, 일본어, 한국어로 된 강좌와 강의 동영상을 누군가 번역해 주기를 기다리지 않고 지금 바로 따라가고 싶은 분." })}
${feature({ icon: "users", title: "콘퍼런스 청중", text: "해외 연사가 나오는 웨비나와 온라인 콘퍼런스에서 말할 필요 없이 듣기만 하는 분." })}
${feature({ icon: "play", title: "동영상 시청자", text: "기술 동영상, 강연, 인터뷰의 내장 자막에 내 언어가 없는 분." })}
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "추가 설치 없음", title: "플레이어나 플랫폼에 좌우되지 않습니다" })}
<p>AI Translator는 컴퓨터에서 재생되는 소리를 캡처하므로, 보고 있는 웹사이트나 플랫폼에 좌우되지 않습니다. <strong>시작</strong>을 누른 다음 동영상을 재생하면, 플레이어 창 위의 떠 있는 바에 번역 자막이 나타납니다. 브라우저의 동영상으로는 시험했지만, 강좌나 웨비나 플랫폼을 하나하나 시험하지는 않았습니다. AI Translator는 실시간 동영상 번역기로 쓸 수 있습니다. 컴퓨터의 브라우저나 플레이어 앱에서 동영상이 재생되는 동안 소리를 듣고 떠 있는 바에 자막을 표시합니다. 동영상 파일을 열거나 처리하지는 않습니다. 업로드도 더빙도 없으며 동영상 자체에 자막을 넣지도 않습니다(세션 대본은 SRT로 내보낼 수 있습니다. 아래 참고). 라이브 영상은 <a href="/ko/solutions/livestream-translation/">라이브 방송 번역</a>을 참고하세요.</p>
<p>macOS에서는 <em>시스템 오디오 녹음</em> 권한을 한 번만 허용하면 됩니다. 웨비나는 기본 입력 소스인 ‘컴퓨터 오디오’로 충분합니다. <a href="/ko/guide/macos-audio-permission/">권한 허용 방법</a>을 참고하세요.</p>
</div></section>

<section class="section"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">둘 다 읽기</span>
<h2>원문과 번역을 한 번에</h2>
<p>‘설정 › 자막’의 <em>번역 위에 원문 표시</em> 옵션(기본값 켜짐)은 원래 문장을 번역 바로 위에 작은 글씨로 보여 줍니다. 언어를 배우는 분이나 용어를 다시 확인하고 싶은 분에게 알맞습니다.</p>
${checkList([
  "글자 크기 14~48 px, 글자색 5가지, 배경색 5가지, 불투명도 조절",
  "마우스 휠이나 단축키로 위로 스크롤해 이전 문장을 다시 읽을 수 있습니다. <em>최신</em> 버튼은 실시간 줄로 돌아갑니다",
  "<em>문장을 끝내는 정지 시간</em>은 50~800 ms로 정할 수 있습니다. 동영상을 볼 때처럼 바로 반응할 필요가 없다면 값을 올려 문장이 덜 끊기게 하세요",
])}
</div>
<div>
${overlayShot({ slug: "overlay-custom", lang: "ko", alt: "큰 글자 크기로 남색 배경에 노란 글자를 표시한 자막 바", caption: "같은 바의 모양을 바꾼 모습: 남색 배경에 노란 글자." })}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "긴 세션", title: "긴 행사도 끊김 없이 끝까지" })}
<p><strong>5시간 23분</strong> 동안 이어진 세션 하나(브라우저에서 재생한 영어 강의 동영상)는 6,019개 구간, 오류 없음, 지연 중앙값 0.48초로 끝났습니다. 조건: Mac M4 Pro, macOS, 애드혹 서명 릴리스 빌드, 1회 실행이며, 정식 인수 테스트는 아닙니다. 별도로 한 2시간 안정성 테스트에서도 프로세스가 다시 시작된 적은 없었습니다.</p>
${callout({ title: "긴 행사의 번역 시간.", text: "번역한 발화만 세고 조용한 시간은 세지 않습니다. 이미 읽고 싶은 언어로 된 문장도 세지 않지만, 되감아서 두 번 들은 부분은 셉니다. Free는 10일 체험 동안 하루 30분이므로, 긴 웨비나에는 Monthly(30일마다 50시간), 6 Months(30일마다 100시간), Yearly(무제한)가 필요합니다. <a href=\"/ko/pricing/\">요금</a>을 참고하세요." })}
</div></section>

<section class="section"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-transcript", lang: "ko", alt: "시간, 원문, 번역이 있는 대본과 검색창, 모두 복사 버튼, 내보내기 형식 선택", caption: "대본: 검색, 복사, TXT·SRT·Markdown으로 내보내기." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">다시 공부하기</span>
<h2>대본을 남겨 나중에 복습하기</h2>
${checkList([
  "대본(시간, 원문, 번역)을 <strong>모두 복사</strong>하는 기능은 모든 요금제에서 쓸 수 있습니다",
  "<strong>TXT, SRT, Markdown으로 내보내기</strong>와 기록 저장은 Pro 기능입니다",
  "<strong>TXT와 Markdown</strong>에는 문장마다 시각이 기록되고, <strong>SRT</strong>에는 ‘시작’을 누른 순간부터의 시간이 기록되며 번역과 원문 중 무엇을 텍스트로 쓸지 고를 수 있습니다",
])}
<p class="small muted">SRT는 동영상과 동기화되지 않습니다. 동영상을 0초부터 재생하는 순간에 정확히 ‘시작’을 눌렀을 때만 시간이 대략 맞습니다. 그렇지 않으면 사용하는 자막 도구로 시간을 옮기세요. <a href="/ko/guide/history-and-export/">기록과 내보내기</a>를 참고하세요.</p>
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "전문 강좌", title: "전문적인 내용에는 용어집을" })}
<p>의료, 금융, 프로그래밍 강좌에는 번역이 틀리기 쉬운 용어가 가득합니다. <strong>용어집</strong>(Pro)에 ‘원어 → 번역어’ 쌍을 추가하세요: 최대 500개, CSV 가져오기와 내보내기, 대소문자 구분 없음. 앱은 일치하는 용어를 힌트로 번역기에 넘기므로, 매번 그대로 번역된다는 보장은 없습니다. <a href="/ko/guide/glossary/">용어집 가이드</a>를 참고하세요.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "팁", title: "더 매끄럽게 쓰려면" })}
${checkList([
  "<strong>오디오 소스를 ‘{앱 이름}만’으로 고르기(macOS):</strong> ‘설정 › 오디오’에서 브라우저나 미디어 플레이어를 고르면 다른 소리는 번역되지 않습니다. 목록에는 소리를 내는 앱만 보이므로, 먼저 동영상을 재생한 다음 <em>목록 새로 고침</em>을 누르세요.",
  "<strong>보는 동안 시스템 알림 음소거하기:</strong> 아직 앱 하나만 고를 수 없는 Windows에서 특히 효과적입니다.",
  "<strong>원본 언어 고정하기:</strong> 행사 전체가 한 언어일 때 쓰세요. 연사가 언어를 바꾼다면 자동 감지를 그대로 두세요.",
  "<strong>재생하기 전에 ‘시작’ 누르기:</strong> 앱은 처음 몇 초 동안 모델을 불러옵니다(설치나 업데이트 직후 첫 실행은 더 오래 걸려 몇 분이 걸릴 수도 있습니다).",
])}
<p>5개 언어는 어느 방향으로든 번역됩니다. 번역 품질은 베트남어가 포함된 언어 쌍만 측정했습니다. 다른 쌍(예: 영어에서 일본어)도 작동하지만 아직 품질 점수가 없습니다.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "솔직한 한계", title: "알아 두어야 할 것" })}
${checkList([
  "<strong>번역은 틀릴 수 있습니다.</strong> 특히 전문 용어, 고유 명사, 알아듣기 어려운 발화가 그렇습니다. 중요한 결정에는 확인 없이 의존하지 마세요.",
  "<strong>지연</strong>은 Mac M4 Pro에서 Standard 팩으로 중앙값 0.76~1.03초입니다. 성능이 낮은 기기에서는 지연이 더 커지며, M1 Mac에서는 측정하지 않았습니다. 반응할 필요가 없는 동영상에서는 회의만큼 지연이 중요하지 않습니다.",
  "<strong>인식</strong>은 베트남어, 일본어, 한국어, 중국어에서 Lite 팩이 정확도가 낮고, 큰 음악이나 소음 아래처럼 발화가 또렷하지 않을 때도 나빠집니다.",
  "<strong>macOS</strong>(Apple 실리콘, 14.2 이상)<strong>와 Windows 10/11</strong>(x64)에서 실행됩니다. 번역은 떠 있는 바에만 표시되며, 동영상에 더해지지도 않고 게시자의 공식 자막을 대신하지도 않습니다.",
], true)}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "계속 읽기", title: "다음 단계", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ko/guide/quick-start/", icon: "zap", title: "빠른 시작", text: "설치부터 첫 자막까지.", more: "가이드 열기" })}
${linkCard({ href: "/ko/solutions/online-meeting-translation/", icon: "users", title: "온라인 회의", text: "Zoom, Teams, Meet, Zalo용.", more: "솔루션 보기" })}
${linkCard({ href: "/ko/features/", icon: "sliders", title: "기능", text: "모든 기능과 성능 측정 결과.", more: "기능 보기" })}
</div>
<p class="center-text reveal">보는 내용이 어디로 가는지 궁금한가요? <a href="/ko/data-security/">데이터와 보안</a>을 읽어 보세요.</p>
</div></section>

${ctaBand({ title: "내 동영상으로 직접 써 보세요", text: "10일 무료 체험으로 시작하세요. 하루 30분, 카드도 계정도 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/pricing/", label: "요금 보기" } })}
`,
};
