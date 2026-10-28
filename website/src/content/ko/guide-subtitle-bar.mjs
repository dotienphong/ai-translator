import { pageHero, callout, appShot, overlayShot, keys, docLayout, docNav } from "../../build/components.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "가이드", path: "/ko/guide/" },
  { name: "자막 바와 단축키", path: "/ko/guide/subtitle-bar-and-shortcuts/" },
];

const toc = [
  { level: 2, id: "move-and-resize", text: "옮기기와 크기 조절" },
  { level: 2, id: "lock", text: "잠금과 잠금 해제" },
  { level: 2, id: "show-hide", text: "표시와 숨기기" },
  { level: 2, id: "scroll", text: "이전 문장으로 스크롤" },
  { level: 2, id: "style", text: "글꼴 크기, 색, 불투명도" },
  { level: 2, id: "speakers", text: "누가 말하는지: 색과 이름" },
  { level: 2, id: "indicators", text: "바에 나타나는 표시" },
  { level: 2, id: "shortcuts", text: "기본 단축키" },
  { level: 2, id: "change-shortcuts", text: "단축키 바꾸기" },
  { level: 2, id: "menu-bar", text: "메뉴 막대와 트레이 메뉴" },
  { level: 2, id: "closing-the-window", text: "창을 닫아도 종료되지 않는 이유" },
];

export default {
  id: "guide-subtitle-bar",
  lang: "ko",
  path: "/ko/guide/subtitle-bar-and-shortcuts/",
  title: "AI Translator 자막 바와 단축키",
  description:
    "AI Translator 자막 바를 옮기고, 잠그고, 숨기고, 스크롤하는 방법, 글꼴 크기·색·불투명도 설정, macOS와 Windows의 기본 단축키와 메뉴 막대 메뉴.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "자막 바와 단축키",
  lead: "자막 바는 항상 맨 위에 떠 있는 창으로, 회의 앱의 포커스를 빼앗지 않고 번역을 보여 줍니다. 끌어서 옮기고, 가장자리를 끌어 크기를 바꾸고, 잠가서 마우스가 통과하게 하며, ⌃⌥T(시작 또는 중지)와 ⌃⌥H(표시 또는 숨기기) 같은 단축키로 조작합니다.",
  meta: "<span>macOS와 Windows</span> <span>업데이트 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "이 가이드의 내용",
  body: `
<h2 id="move-and-resize">옮기기와 크기 조절</h2>
<p>바가 잠기지 않았을 때는 어디든 끌어서 옮길 수 있습니다. 위쪽 가장자리 가운데의 작은 손잡이가 옮길 수 있다는 표시입니다. 가장자리나 모서리를 끌면 크기가 바뀌며, 가장 작은 크기는 320 × 80입니다. 앱은 화면마다 위치와 크기를 따로 기억합니다. 기본적으로 바는 화면 가운데, 아래쪽 가장자리 가까이에 있습니다.</p>
${overlayShot({ slug: "overlay-default", lang: "ko", alt: "기본 자막 바: 반투명 검은 배경에 흰 글자로, 원문을 번역 위에 작은 글씨로 표시", caption: "기본 자막 바. 잠기지 않았을 때는 위쪽 가장자리 가운데에 작은 손잡이가 보이고 테두리가 더 밝습니다." })}

<h2 id="lock">잠금과 잠금 해제(클릭 통과)</h2>
<p>바를 잠그면 마우스가 바를 그대로 통과하므로, 회의의 버튼이나 채팅 창을 가리지 않습니다. 잠기면 위쪽 손잡이가 사라지고 테두리가 흐려지며 바에 버튼이 없습니다.</p>
<ul>
<li>홈 화면의 <strong>자막 바</strong> 카드에서 <strong>잠금(클릭 통과)</strong> 또는 <strong>잠금 해제</strong>를 누릅니다.</li>
<li>단축키 ${keys(["⌃", "⌥", "L"])}.</li>
<li>메뉴 막대 메뉴: <strong>자막 잠금(클릭 통과)</strong> 또는 <strong>자막 잠금 해제</strong>.</li>
</ul>
${overlayShot({ slug: "overlay-locked", lang: "ko", alt: "손잡이도 버튼도 없는 잠긴 자막 바가 회의 화면 위에 번역을 보여 줌", caption: "잠긴 바: 버튼 없이 깔끔하며, 클릭이 통과합니다." })}
${callout({ title: "잠긴 바는 클릭할 수 없습니다.", text: "잠금을 풀려면 단축키, 메뉴 막대 메뉴, 홈 화면의 버튼을 쓰세요." })}

<h2 id="show-hide">표시와 숨기기</h2>
<p>잠기지 않은 바에 마우스를 올리면 오른쪽 위 모서리에 <strong>✕</strong> 버튼이 나타납니다(‘자막 닫고 번역 중지’, 마우스를 올리면 빨간색으로 바뀜). 누르면 바를 숨기는 동시에 번역도 멈추므로 ‘중지’를 따로 누를 필요가 없으며, 앱은 종료되지 않습니다. 번역은 계속하면서 바만 숨기려면 ${keys(["⌃", "⌥", "H"])}, 홈 화면의 <strong>숨기기</strong> 버튼, 메뉴 막대 메뉴를 쓰세요. 같은 방법으로 바를 다시 나타나게 할 수 있습니다. 앱을 열 때 바는 숨겨져 있고, ‘시작’을 누르면 나타나며, ‘중지’를 누르면 마지막 줄을 남깁니다.</p>

<h2 id="scroll">이전 문장으로 스크롤</h2>
<p>바에는 세션의 최근 1000문장까지 남습니다. 맨 아래에 있는 동안에는 새 문장을 저절로 따라갑니다. 마우스 휠이나 트랙패드로 위로 스크롤하면(잠기지 않았을 때) 따라가기를 멈추고 오른쪽 아래 모서리에 <strong>↓ 최신</strong> 버튼이 나타나며, 누르면 현재 문장으로 돌아옵니다. 바가 잠겨 있으면 마우스가 통과하므로 ${keys(["⌃", "⌥", "PageUp"])}과 ${keys(["⌃", "⌥", "PageDown"])}을 쓰세요. 바 높이의 약 80%씩 스크롤하며, 이때 ‘최신’ 표시는 이전 문장을 보고 있다는 것만 알려 줍니다. MacBook 키보드에는 Page Up과 Page Down 전용 키가 없으니, 쓰기 불편하면 이 두 단축키를 바꾸세요.</p>

<h2 id="style">글꼴 크기, 색, 불투명도</h2>
<p><strong>설정 › 자막</strong>을 엽니다. 위쪽의 <strong>미리보기</strong>는 설정한 글자 색, 배경, 불투명도, 글꼴 크기로 예문을 그려 주며, 슬라이더를 끄는 동안에도 바뀝니다. 실제 바도 바로 바뀝니다. 번역하지 않을 때 실제 바에서 보려면 자막 바 줄의 <strong>표시</strong>를 누르세요.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">설정</th><th scope="col">선택지</th><th scope="col">기본값</th></tr></thead>
<tbody>
<tr><th scope="row">글꼴 크기</th><td>14~48 px</td><td>20 px</td></tr>
<tr><th scope="row">글자 색</th><td>흰색, 노란색, 초록색, 하늘색, 주황색</td><td>흰색</td></tr>
<tr><th scope="row">배경색</th><td>검은색, 짙은 회색, 남색, 짙은 갈색, 짙은 보라색</td><td>검은색</td></tr>
<tr><th scope="row">배경 불투명도</th><td>0~100%(0%는 투명한 배경, 100%는 불투명)</td><td>60%</td></tr>
<tr><th scope="row">번역 위에 원문 표시</th><td>켜기 또는 끄기</td><td>켜기</td></tr>
</tbody></table></div>
<div class="grid grid-2">
${appShot({ slug: "app-settings-subtitles", lang: "ko", alt: "자막 설정: 위쪽에 예문 미리보기, 글꼴 크기 슬라이더, 두 줄의 색 견본, 배경 불투명도 슬라이더, 원문 표시 스위치", caption: "설정 › 자막." })}
${overlayShot({ slug: "overlay-custom", lang: "ko", alt: "큰 글자 크기로 남색 배경에 노란 글자를 표시한 자막 바", caption: "예: 노란 글자, 남색 배경, 더 큰 글꼴." })}
</div>

<h2 id="speakers">누가 말하는지: 색과 이름</h2>
<p>macOS의 AI Translator 0.3.2 이상에서는 자막 바에 누가 말하는지 표시할 수 있습니다. 모든 요금제에서 기본으로 켜져 있으며 <strong>설정 › 자막 › 화자</strong>에서 끌 수 있습니다.</p>
<ul>
<li><strong>목소리마다 색을 다르게 표시합니다.</strong> 목소리 구분은 이 컴퓨터에서 하며 등장 순서대로 “화자 1”, “화자 2”로 표시합니다. 라벨과 색 막대는 각 발언의 첫 줄에 나타나고, 같은 사람의 다음 문장에는 색 막대만 붙습니다.</li>
<li><strong>Microsoft Teams에서 실제 이름을 가져옵니다.</strong> 컴퓨터에 설치한 Teams 앱에서 회의를 번역하면 회의 창에서 참가자 이름을 읽고, 충분히 확실할 때만 이름을 표시합니다. 확실하지 않으면 “화자 N”을 유지합니다. 틀린 이름이 일반 라벨보다 나쁘기 때문입니다. 채팅은 읽지 않으며 화면을 캡처하지 않습니다. Google Meet와 Zoom의 이름은 아직 지원하지 않습니다.</li>
<li><strong>직접 고칠 수 있습니다.</strong> 메인 창의 기록에서 라벨을 누르면 이름을 바꾸거나 <em>회의 참가자 중에서 선택</em>하거나, 두 라벨이 같은 사람일 때 <em>다른 화자와 합치기</em>를 할 수 있습니다. 변경은 진행 중인 세션 전체에 적용됩니다.</li>
<li><strong>권한.</strong> 이름을 읽으려면 macOS가 <em>손쉬운 사용</em> 권한을 요청합니다. 바에 짧은 안내(<em>말하는 사람의 이름을 표시하려면 손쉬운 사용 권한을 허용하세요</em>)와 설정을 여는 버튼이 표시되며, 앱이 시스템 대화상자를 스스로 열지는 않습니다. 앱을 업데이트한 뒤 macOS가 다시 요청할 수 있습니다. 권한이 없어도 색과 “화자 N”은 사용할 수 있습니다.</li>
<li><strong>기록과 내보내기.</strong> 라벨과 이름은 Pro 요금제에서 ‘기록 저장’을 켠 경우에만 기록과 내보낸 파일에 저장됩니다. 복사 버튼과 내보내기는 모든 요금제에서 본문에 라벨을 포함합니다.</li>
</ul>
<p>제한: 목소리가 매우 비슷한 두 사람이 하나의 라벨을 함께 쓸 수 있고, 여러 사람이 동시에 말하면 라벨이 틀릴 수 있습니다. Windows는 아직 지원하지 않으며, Google Meet와 Zoom에서는 색과 “화자 N”은 표시되지만 이름은 아직 지원하지 않습니다.</p>

<h2 id="indicators">바에 나타나는 표시</h2>
<p>바의 오른쪽 위 모서리에는 점 하나와 짧은 안내 몇 가지가 나타납니다:</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">보이는 것</th><th scope="col">뜻</th></tr></thead>
<tbody>
<tr><th scope="row">작은 초록색 점</th><td>소리가 들어오고 있습니다. 소리가 없으면 점이 옅은 흰색입니다. 점은 세션 중에만 보입니다</td></tr>
<tr><th scope="row">모델을 불러오는 중…</th><td>AI 처리가 시작되는 세션의 처음 몇 초</td></tr>
<tr><th scope="row">처리가 따라가지 못하고 있습니다</th><td>자막이 말보다 늦습니다</td></tr>
<tr><th scope="row">소리가 들리지 않습니다…</th><td>한동안 소리가 없습니다. 회의 소리가 재생되고 있는지 확인하세요</td></tr>
<tr><th scope="row">남은 번역 시간이 5분 미만입니다</th><td>번역 시간 한도에 가까워졌습니다</td></tr>
<tr><th scope="row">번역 시간을 모두 사용했습니다 · …에 초기화</th><td>세션이 멈췄습니다. 바에 표시된 시각에 번역 시간이 다시 열립니다</td></tr>
</tbody></table></div>
<p>흐린 줄은 임시 자막이며, 말이 이어지면 완성된 문장으로 바뀝니다. 작은 ‘번역 안 됨’ 태그는 앱이 번역하지 못한 문장을 나타냅니다.</p>

<h2 id="shortcuts">기본 단축키</h2>
<p>단축키는 AI Translator가 맨 앞 창이 아니어도 모든 앱에서 작동합니다.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">동작</th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">번역 시작 또는 중지</th><td>${keys(["⌃", "⌥", "T"])}</td><td>${keys(["Ctrl", "Alt", "T"])}</td></tr>
<tr><th scope="row">자막 표시 또는 숨기기</th><td>${keys(["⌃", "⌥", "H"])}</td><td>${keys(["Ctrl", "Alt", "H"])}</td></tr>
<tr><th scope="row">자막 잠금 또는 잠금 해제</th><td>${keys(["⌃", "⌥", "L"])}</td><td>${keys(["Ctrl", "Alt", "L"])}</td></tr>
<tr><th scope="row">자막 위로 스크롤(이전 문장)</th><td>${keys(["⌃", "⌥", "PageUp"])}</td><td>${keys(["Ctrl", "Alt", "PageUp"])}</td></tr>
<tr><th scope="row">자막 아래로 스크롤(최신 문장)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
<tr><th scope="row">입력 번역 상자 열기 또는 닫기</th><td>${keys(["⌃", "⌥", "G"])}</td><td>${keys(["Ctrl", "Alt", "G"])}</td></tr>
</tbody></table></div>
<p class="small muted">macOS에서 ⌃는 Control 키, ⌥는 Option 키입니다(Command가 아님).</p>
<p>입력 번역 단축키는 입력 번역이 켜져 있을 때(설정 › 입력 번역)만 작동합니다. 입력 상자 쓰는 법은 <a href="/ko/guide/type-and-translate/">입력 번역</a>을 참고하세요.</p>

<h2 id="change-shortcuts">단축키 바꾸기</h2>
<ol>
<li><strong>설정 › 단축키</strong>를 엽니다.</li>
<li>동작 옆의 <strong>변경</strong>을 누릅니다.</li>
<li>새 단축키를 누르거나, <strong>Esc</strong>로 취소합니다.</li>
</ol>
<p>새 단축키에는 Ctrl, Alt, Cmd 중 하나 이상이 있어야 하며, Shift만으로는 안 됩니다. 앱 자신의 단축키를 고르면 ‘이 단축키는 이미 다른 동작에 사용 중입니다.’, 운영체제가 받아들이지 않으면 ‘시스템에서 이 단축키를 거부했습니다. 다른 앱이 사용 중일 수 있습니다.’라고 표시됩니다. 기본 키가 Zoom, Teams, Meet의 단축키와 겹치는지는 확인하지 않았습니다. 겹친다면 여기에서 단축키를 바꾸세요.</p>
${appShot({ slug: "app-settings-hotkeys", lang: "ko", alt: "입력 번역 열기를 포함한 동작 여섯 개와 각각의 macOS 기본 키 조합, 변경 버튼이 있는 단축키 설정", caption: "설정 › 단축키." })}

<h2 id="menu-bar">메뉴 막대와 트레이 메뉴</h2>
<p>메뉴 막대의 AI Translator 아이콘(음파가 든 말풍선)으로 메인 창을 열지 않고 앱을 조작할 수 있습니다. 마우스를 올리면 ‘준비됨’ 또는 ‘번역 중’ 같은 상태가 보입니다.</p>
<p>Windows에서는 아이콘(앱의 컬러 로고)이 작업 표시줄 오른쪽 끝의 시스템 트레이에 있으며, Windows가 <strong>^</strong> 화살표 뒤에 숨길 수 있습니다. 아이콘을 오른쪽 클릭하면 아래 메뉴가 열리고, 왼쪽 클릭하면 메인 창이 열립니다.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">메뉴 항목</th><th scope="col">나타나는 때</th></tr></thead>
<tbody>
<tr><th scope="row">번역 시작 / 번역 중지</th><td>상태에 따라 바뀝니다</td></tr>
<tr><th scope="row">자막 표시 / 자막 숨기기</th><td>상태에 따라 바뀝니다</td></tr>
<tr><th scope="row">자막 잠금(클릭 통과) / 자막 잠금 해제</th><td>상태에 따라 바뀝니다</td></tr>
<tr><th scope="row">메인 창 열기</th><td>항상</td></tr>
<tr><th scope="row">업데이트 확인…</th><td>항상. ‘설정 › 일반’을 열고 바로 확인합니다</td></tr>
<tr><th scope="row">다시 시작하여 업데이트</th><td>업데이트를 내려받았고 앱이 번역하지 않을 때</td></tr>
<tr><th scope="row">종료</th><td>항상. 실행 중인 세션을 멈춘 뒤 완전히 종료합니다</td></tr>
<tr><th scope="row">등록하지 못한 단축키가 있습니다</th><td>단축키 등록에 실패했을 때만</td></tr>
</tbody></table></div>

<h2 id="closing-the-window">창을 닫아도 앱이 종료되지 않는 이유</h2>
<p>AI Translator는 메인 창을 닫은 뒤에도 단축키와 실행 중인 세션이 계속 작동하도록, 메뉴 막대(macOS)나 시스템 트레이(Windows)에 머물도록 만들어졌습니다. 닫기 버튼은 창을 숨길 뿐입니다. Mac에서는 ⌘Q로도 종료되지 않으며, 앱은 ‘AI Translator는 메뉴 막대에서 계속 실행됩니다. 종료하려면 메뉴 막대 아이콘에서 ‘종료’를 선택하세요.’라는 안내와 함께 메인 창을 다시 보여 줍니다. 완전히 종료하려면 메뉴 막대나 시스템 트레이의 아이콘에서 <strong>종료</strong>를 고르세요.</p>
<p>잘 안 되나요? <a href="/ko/guide/troubleshooting/">문제 해결</a>을 참고하세요. 전체 소개는 <a href="/ko/features/">기능</a> 페이지에 있습니다.</p>

${docNav(
  [
    { href: "/ko/guide/macos-audio-permission/", kicker: "이전", title: "macOS에서 시스템 오디오 녹음 권한 허용하기" },
    { href: "/ko/guide/type-and-translate/", kicker: "다음", title: "입력 번역" },
    { href: "/ko/guide/troubleshooting/", kicker: "관련", title: "문제 해결" },
  ],
  "관련 가이드",
)}
`,
})}
</div></section>
`,
};
