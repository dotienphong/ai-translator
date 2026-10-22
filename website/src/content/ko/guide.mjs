import { pageHero, sectionHead, linkCard, callout, facts, icon } from "../../build/components.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "가이드", path: "/ko/guide/" },
];

const MORE = "가이드 읽기";

export default {
  id: "guide",
  lang: "ko",
  path: "/ko/guide/",
  title: "AI Translator 사용 가이드",
  description:
    "단계별 가이드 10개: macOS나 Windows에 설치, 녹음 권한, 단축키, 입력 번역, 용어집, 기록과 내보내기, 키 구매, 문제 해결.",
  schemaType: "CollectionPage",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator 사용 가이드",
  lead: "macOS나 Windows에 설치하는 것부터 키를 구매하고 문제를 해결하는 것까지, AI Translator를 단계별로 안내하는 가이드 10개입니다. 모든 가이드는 앱에 보이는 그대로의 버튼과 메뉴 이름을 쓰며, 대부분 실제 화면의 스크린숏이 들어 있습니다.",
})}

<section class="section-tight"><div class="container">
${callout({ title: "이 가이드는 macOS와 Windows를 모두 다룹니다.", text: "대부분의 단계는 두 시스템에서 같습니다. Windows에서의 주요 차이: PowerShell 명령으로 설치합니다(.exe 파일도 쓸 수 있지만, Windows 버전은 아직 코드 서명되지 않아 SmartScreen 경고가 뜰 수 있습니다). 오디오 권한을 허용할 필요가 없고, 아이콘은 메뉴 막대가 아니라 시스템 트레이에 있으며, 단축키는 ⌃⌥ 대신 Ctrl+Alt를 씁니다. 아직 설치 파일이 없나요? <a href=\"/ko/download/\">다운로드 페이지</a>를 참고하세요." })}
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "시작하기", title: "설치 파일부터 첫 자막까지" })}
<div class="grid grid-2">
${linkCard({ href: "/ko/guide/quick-start/", icon: "play", title: "빠른 시작", text: "처음 한 번만 하는 설정 7단계와 첫 회의 번역. 앱 설정 화면의 스크린숏이 함께 있습니다.", more: MORE })}
${linkCard({ href: "/ko/guide/install-macos/", icon: "download", title: "macOS에 설치", text: "명령 하나로 설치하거나 .dmg로 설치(응용 프로그램으로 끌기, 그래도 열기), SHA-256 확인과 제거.", more: MORE })}
${linkCard({ href: "/ko/guide/install-windows/", icon: "download", title: "Windows에 설치", text: "PowerShell 명령 하나로 설치하거나 .exe로 설치(SHA-256, SmartScreen), 스마트 앱 컨트롤과 제거.", more: MORE })}
${linkCard({ href: "/ko/guide/macos-audio-permission/", icon: "mic", title: "오디오 권한(macOS)", text: "시스템 오디오 녹음 요청에 답하고, 시스템 설정에서 다시 켜고, 오디오 소스를 고릅니다.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "일상적인 사용", title: "자막 바, 입력 번역, 용어집, 대본을 제대로 쓰기" })}
<div class="grid grid-2">
${linkCard({ href: "/ko/guide/subtitle-bar-and-shortcuts/", icon: "captions", title: "자막 바와 단축키", text: "바 옮기기, 잠그기, 숨기기, 스크롤하기, 글자 크기와 색 바꾸기, 단축키 표와 메뉴 막대 메뉴.", more: MORE })}
${linkCard({ href: "/ko/guide/type-and-translate/", icon: "message", title: "입력 번역", text: "쓰고 있는 채팅 창에서 ⌃⌥G(Ctrl+Alt+G)를 누르고 내 언어로 입력한 뒤 Enter를 누르면 번역이 붙여 넣어집니다. macOS에서는 손쉬운 사용 권한이 필요합니다.", more: MORE })}
${linkCard({ href: "/ko/guide/glossary/", icon: "book", title: "용어집 쓰기", text: "이름과 용어 추가, CSV 가져오기와 내보내기, 그리고 용어집이 보장이 아니라 번역기에 주는 힌트인 이유.", more: MORE })}
${linkCard({ href: "/ko/guide/history-and-export/", icon: "history", title: "기록과 대본 내보내기", text: "기록 저장을 켜고, 지난 세션을 다시 보고, 대본을 복사하고, TXT, SRT, Markdown으로 내보냅니다.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "요금제와 지원", title: "요금제, 키, 그리고 문제가 생겼을 때" })}
<div class="grid grid-2">
${linkCard({ href: "/ko/guide/buy-and-activate/", icon: "key", title: "요금제 구매, 키 활성화, 컴퓨터 바꾸기", text: "앱 안에서 VietQR이나 해외 카드로 Monthly, 6 Months, Yearly를 구매하고, 키를 입력하고, 컴퓨터를 바꾸고, 갱신하고, 잃어버린 키를 되찾습니다.", more: MORE })}
${linkCard({ href: "/ko/guide/troubleshooting/", icon: "support", title: "문제 해결", text: "자막이 안 나옴, 번역 시간 소진, 키 잠김, 모델 다운로드 실패: 각각의 원인과 해결 방법.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container narrow">
${sectionHead({ title: "상황별로 가이드 찾기" })}
${facts([
  ["처음 실행할 때 macOS가 앱을 차단함", "<a href=\"/ko/guide/install-macos/\">macOS에 설치</a>의 ‘첫 실행’ 절을 참고하세요"],
  ["Windows에 ‘Windows의 PC 보호’가 표시됨", "<a href=\"/ko/guide/install-windows/\">Windows에 설치</a>의 ‘설치 프로그램 실행’ 절을 참고하세요"],
  ["‘시작’을 눌러도 아무것도 나오지 않음", "<a href=\"/ko/guide/macos-audio-permission/\">오디오 권한</a>, 그다음 <a href=\"/ko/guide/troubleshooting/\">문제 해결</a>을 참고하세요"],
  ["자막 바가 사라졌거나 반응하지 않음", "<a href=\"/ko/guide/subtitle-bar-and-shortcuts/\">자막 바와 단축키</a>의 ‘표시와 숨기기’와 ‘잠금’ 절을 참고하세요"],
  ["대본을 저장하거나 내보내고 싶음", "<a href=\"/ko/guide/history-and-export/\">기록과 내보내기</a>를 참고하세요"],
  ["이름과 용어가 늘 같게 번역되었으면 함", "<a href=\"/ko/guide/glossary/\">용어집</a>을 참고하세요"],
  ["상대방의 언어로 답하고 싶음", "<a href=\"/ko/guide/type-and-translate/\">입력 번역</a>을 참고하세요"],
  ["컴퓨터를 바꿨거나 키를 잃어버림", "<a href=\"/ko/guide/buy-and-activate/\">키 구매와 활성화</a>를 참고하세요"],
])}
</div></section>

<section class="section-tight"><div class="container narrow">
<div class="card reveal">
<h2>도움이 필요하신가요?</h2>
<p>가이드에서 답을 찾지 못했나요? <a href="/ko/faq/">자주 묻는 질문</a>을 읽거나 <a href="/ko/contact/">문의</a> 페이지로 연락해 주세요. <strong>support@aitranslator.io.vn</strong>으로 메일을 보내실 수 있습니다.</p>
<p class="more-link"><a class="btn btn-secondary" href="/ko/contact/">지원팀에 문의 ${icon("arrow-right")}</a> <a class="btn btn-ghost" href="/ko/faq/">자주 묻는 질문</a></p>
</div>
</div></section>
`,
};
