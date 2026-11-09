import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "솔루션", path: "/ko/solutions/" },
  { name: "YouTube 번역", path: "/ko/solutions/youtube-translation/" },
];

const FAQ = [
  {
    q: "YouTube 동영상을 한국어로 번역하려면 어떻게 하나요?",
    a: `<p>컴퓨터에 AI Translator를 설치하고 데스크톱 브라우저(Chrome, Safari, Edge, Firefox)에서 YouTube 동영상을 연 뒤, ‘번역 언어’에서 한국어를 선택하고 <strong>시작</strong>을 누르세요. 앱이 컴퓨터에서 나오는 오디오를 직접 인식하여 플로팅 바에 실시간 번역 자막을 표시합니다. 영상 게시자가 자막을 올려두지 않았어도 바로 이용할 수 있습니다.</p>`,
  },
  {
    q: "AI Translator로 YouTube 라이브 방송도 실시간 번역할 수 있나요?",
    a: `<p>네, 가능합니다. 컴퓨터의 시스템 오디오를 실시간으로 캡처하므로 YouTube Live 생방송도 일반 동영상과 똑같이 번역됩니다. 브라우저에서 재생한 동영상으로 테스트해 보았고, YouTube 라이브로도 한 번 테스트했습니다(영어 뉴스 채널, Mac M4 Pro의 Chrome, 2026년 10월 25일). 약 4분간 시청하는 동안 낮은 지연으로 안정적인 자막이 제공되었습니다.</p>`,
  },
  {
    q: "스마트폰의 YouTube 앱에서도 쓸 수 있나요?",
    a: `<p>아니요. AI Translator는 macOS(Apple 실리콘) 및 Windows 10/11 x64 데스크톱 PC 전용 앱이며, 모바일 기기는 지원하지 않습니다. 번역 자막을 확인하려면 컴퓨터 브라우저에서 YouTube를 실행해 주세요.</p>`,
  },
  {
    q: "브라우저에 확장 프로그램이나 플러그인을 설치해야 하나요?",
    a: `<p>아니요. 브라우저 확장 프로그램이나 별도 플러그인을 설치할 필요가 없으며, YouTube 계정 연동도 필요하지 않습니다. AI Translator는 독립된 데스크톱 앱으로서 컴퓨터 내에서 안전하게 사운드를 캡처합니다.</p>`,
  },
  {
    q: "AI Translator를 통한 YouTube 번역은 무료인가요?",
    a: `<p>Free 요금제를 통해 10일간 하루 최대 30분씩 무료로 체험할 수 있습니다(Google 계정 로그인 필요, 신용카드 등록 불필요). 무료 체험 후에는 <a href="/ko/pricing/">요금 안내</a>에서 Monthly, 6 Months, Yearly 등 유연한 선불 요금제를 선택하실 수 있습니다.</p>`,
  },
];

export default {
  id: "solutions-youtube",
  lang: "ko",
  path: "/ko/solutions/youtube-translation/",
  title: "YouTube 번역: 영상과 라이브 자막",
  description:
    "컴퓨터에서 YouTube 동영상과 라이브 방송 음성을 실시간 번역 자막으로 확인하세요. 온디바이스 AI 구동, 브라우저 확장 프로그램 불필요. 10일 무료 체험.",
  type: "article",
  published: "2026-11-09",
  breadcrumbs: crumbs,
  modified: "2026-11-09",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "YouTube 번역: 동영상 및 라이브 방송 실시간 자막",
  lead: "한국어 자막이 없는 해외 기술 강연이나 학술 세미나, YouTube Live 생방송을 시청하고 계신가요? AI Translator는 컴퓨터에서 재생되는 오디오를 실시간으로 인식해 화면 위 플로팅 바에 번역 자막을 띄워 줍니다. 브라우저 확장 프로그램 없이 온디바이스 AI로 구동되며, 오디오 데이터를 외부로 유출하지 않아 안전합니다.",
  meta: "<span>업데이트 {{updated}}</span><span>macOS 및 Windows 컴퓨터에서 실행, 휴대폰은 지원하지 않음</span>",
})}

<section class="section-tight"><div class="container narrow">
${callout({ kind: "warn", title: "시작하기 전 안내: PC 전용 프로그램입니다.", text: "AI Translator는 macOS 및 Windows 전용 프로그램으로, 스마트폰에서는 작동하지 않습니다. 번역 자막을 보려면 컴퓨터 브라우저에서 YouTube 동영상이나 라이브 방송을 열어 주세요." })}
</div></section>

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["지원 환경", "컴퓨터 브라우저에서 재생되는 YouTube 동영상 및 라이브 방송<small>Chrome, Safari, Edge, Firefox 등 데스크톱 브라우저 지원</small>"],
  ["지원 언어", "영어, 중국어, 일본어, 한국어, 베트남어 상호 번역<small>모든 언어 방향에 대해 공인 번역 벤치마크 점수 측정 완료</small>"],
  ["응답 지연", "중앙값 0.76~1.03초<small>화자가 말을 마친 시점 기준; Mac M4 Pro, Standard 모델 팩 측정</small>"],
  ["구동 방식", "100% 온디바이스(로컬) AI 실시간 추론<small>음성이 외부로 전송되지 않으며, 별도 브라우저 확장 프로그램이 필요 없습니다</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "활용 사례", title: "한국어 자막이 없는 YouTube 영상을 시청할 때", center: true })}
<div class="grid grid-3">
${feature({ icon: "book", title: "온라인 강의 및 기술 튜토리얼", text: "영어, 일본어, 중국어로 진행되는 코딩 강좌, 과학 및 학술 강연을 한국어 번역 자막으로 빠르게 학습할 수 있습니다." })}
${feature({ icon: "users", title: "해외 뉴스 및 팟캐스트", text: "글로벌 뉴스 방송, 업계 전문가 인터뷰, 긴 호흡의 테크 팟캐스트를 끊김 없는 실시간 자막으로 시청하세요." })}
${feature({ icon: "play", title: "YouTube Live 실시간 스트리밍", text: "신제품 키노트 발표회, 글로벌 컨퍼런스 등 라이브 방송을 송출되는 즉시 한국어 자막과 함께 이해할 수 있습니다." })}
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "기능 비교", title: "YouTube 기본 자동 자막과의 차이점" })}
<p>YouTube에도 자동 생성 자막이 있지만, 한국어 자동 번역을 지원하지 않는 영상이 많고 라이브 생방송에서는 기능이 비활성화되거나 지연이 심한 경우가 흔합니다. AI Translator를 통한 YouTube 번역은 다음과 같은 차별점을 제공합니다:</p>
${checkList([
  "<strong>모든 영상 지원:</strong> 채널 운영자가 자막을 별도로 등록하지 않았거나 플랫폼 자동 자막이 없어도 사운드 기반으로 즉시 번역합니다.",
  "<strong>YouTube Live 생방송 완벽 대응:</strong> 기본 자막이 작동하지 않는 실시간 라이브 스트리밍에서도 지연을 최소화해 자막을 표시합니다.",
  "<strong>자유로운 플로팅 자막 바:</strong> 화면 위 원하는 위치로 자막 바를 드래그해 옮길 수 있으며, 글자 크기(14~48 px) 및 색상, 배경 투명도를 조절할 수 있습니다.",
  "<strong>원문·번역문 2단 동시 확인:</strong> 번역 자막 위에 원문을 작은 글씨로 함께 띄울 수 있어 전문 용어 확인과 어학 공부에 최적화되어 있습니다.",
])}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "사용 방법", title: "실시간 번역 자막으로 YouTube를 시청하는 4단계" })}
${steps([
  { title: "AI Translator 설치 및 실행", text: "<a href=\"/ko/download/\">다운로드 페이지</a>의 설치 명령어를 터미널(macOS) 또는 PowerShell(Windows)에 붙여넣어 설치합니다. <em>번역 언어</em>에서 한국어를 선택합니다." },
  { title: "YouTube 동영상 또는 라이브 방송 재생", text: "컴퓨터 브라우저(Chrome, Edge, Safari, Firefox)에서 YouTube 페이지를 열고 소리가 정상적으로 나오도록 재생합니다." },
  { title: "‘시작’ 버튼 클릭", text: "<strong>시작</strong>을 누릅니다(단축키 ⌃⌥T, Windows: Ctrl+Alt+T). macOS 환경에서는 첫 실행 시 <em>시스템 오디오 녹음</em> 권한을 승인해 주세요(<a href=\"/ko/guide/macos-audio-permission/\">권한 안내</a> 참조)." },
  { title: "자막 바 위치 조정", text: "플로팅 자막 바를 영상 창 아래 편안한 위치로 옮기고 ‘설정 › 자막’에서 글자 크기를 조정한 뒤, <em>고정(클릭 투과)</em>을 켭니다." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "시청 팁", title: "더욱 편리한 YouTube 시청을 위한 설정 팁" })}
${checkList([
  "<strong>브라우저 오디오만 캡처(macOS):</strong> 시스템 알림음이 번역되는 것을 방지하려면 ‘설정 › 오디오’에서 <em>Google Chrome만</em>(사용 중인 브라우저)을 지정한 후 시작하세요.",
  "<strong>문장 끊김 민감도 조절:</strong> 말하는 속도가 느리거나 쉬어 가는 구간이 많은 강연의 경우 설정에서 <em>문장을 끝내는 묵음 시간</em>(50~800 ms)을 늘려 주면 문맥이 매끄러워집니다.",
  "<strong>텍스트 스크립트 저장 및 복습:</strong> 긴 강의를 시청한 후에는 타임스탬프가 포함된 전체 스크립트를 복사하거나 TXT, SRT 형식으로 내보내 복습에 활용할 수 있습니다(<a href=\"/ko/guide/history-and-export/\">기록 및 내보내기</a> 참조).",
  "<strong>전문 용어 사전 활용:</strong> IT 기술이나 의학 등 고유명사가 많은 영상을 볼 때는 <em>사용자 지정 용어집</em>에 단어를 미리 등록해 두면 번역 정확도가 한층 향상됩니다.",
])}
</div></section>

<section class="section" id="not-a-fit"><div class="container narrow">
${sectionHead({ eyebrow: "정직한 한계", title: "AI Translator 사용이 적합하지 않은 경우", text: "프로그램의 실제 한계를 투명하게 공유하여 불필요한 번거로움을 덜어 드립니다." })}
${checkList([
  "<strong>스마트폰에서 YouTube 영상을 보고자 하는 경우.</strong> AI Translator는 macOS 및 Windows 전용 프로그램으로, 스마트폰에서는 작동하지 않습니다. 컴퓨터 브라우저를 이용해 주세요.",
  "<strong>자막이 입혀진 영상 파일을 다운로드하려는 경우.</strong> 동영상 파일을 다운로드하지 않습니다. 또한 동영상 파일을 수정하거나 디스크에 저장하지 않으며, 재생 중 화면에 실시간 자막을 띄우고 텍스트 스크립트를 남길 뿐입니다.",
  "<strong>인공지능 목소리 더빙이나 영상 자막 인코딩이 필요한 경우.</strong> 더빙 음성을 생성하거나 영상 파일에 자막을 직접 입히는(인코딩) 기능은 제공하지 않습니다. 자막은 독립된 시스템 플로팅 바로만 표시됩니다.",
  "<strong>지원하지 않는 제3의 언어인 경우.</strong> 현재 영어, 중국어, 일본어, 한국어, 베트남어 5개 국어 간 상호 번역만 지원하며, 기타 언어는 지원하지 않습니다.",
  "<strong>PC 사양이 권장 기준에 미치지 못하는 경우.</strong> 화자가 말을 멈춘 후 자막이 뜨기까지의 지연은 중앙값 0.76~1.03초(Mac M4 Pro, Standard 팩 기준)이며, 사양이 낮은 PC에서는 더 느려질 수 있습니다.",
], true)}
${callout({ kind: "warn", title: "자동 번역에는 오류가 발생할 수 있습니다.", text: "인공지능 실시간 자막은 내용 이해를 돕기 위한 보조 수단입니다. 전문가의 검토 없이 법률, 금융, 의료 등 중대한 결정에 그대로 의존하지 마세요." })}
<p>브라우저에서 재생한 동영상으로 테스트해 보았고, YouTube 라이브로도 한 번 테스트했습니다(영어 뉴스 채널, Mac M4 Pro의 Chrome, 2026년 10월 25일). 약 4분간 시청하는 동안 자막이 안정적으로 표시되었습니다. AI Translator는 PC 환경에서 YouTube 영상을 실시간으로 편안하게 시청할 수 있도록 설계되었습니다.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "자주 묻는 질문", title: "YouTube 번역 관련 자주 묻는 질문" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "더 알아보기", title: "다음 단계", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/ko/solutions/webinar-and-video-translation/", icon: "book", title: "웨비나 및 동영상", text: "온라인 강좌, 세미나 및 장시간 녹화 교육 영상 번역 솔루션.", more: "솔루션 보기" })}
${linkCard({ href: "/ko/solutions/livestream-translation/", icon: "play", title: "라이브 방송 번역", text: "다양한 실시간 스트리밍 방송을 플로팅 자막으로 시청하는 방법.", more: "솔루션 보기" })}
${linkCard({ href: "/ko/pricing/", icon: "wallet", title: "요금제 안내", text: "10일 무료 체험 및 Monthly, 6 Months, Yearly 선불 플랜 안내.", more: "요금제 보기" })}
</div>
<p class="center-text reveal">음성과 데이터 보호 원칙이 궁금하신가요? <a href="/ko/data-security/">데이터 및 보안 정책</a>을 확인해 보세요.</p>
<p class="disclaimer">YouTube는 Google LLC의 상표이며, AI Translator는 Google 또는 YouTube와 제휴 관계가 아닙니다.</p>
</div></section>

${ctaBand({
  title: "AI Translator로 지금 YouTube 번역을 시작하세요",
  text: "명령어 한 줄로 간편하게 설치하고, macOS와 Windows에서 10일간 무료로 체험해 보세요(신용카드 불필요).",
  primary: { href: "/ko/download/", label: "지금 다운로드" },
  secondary: { href: "/ko/pricing/", label: "요금제 확인" },
})}
`,
};
