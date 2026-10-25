import { dataFlow, pageHero, sectionHead, feature, checkList, callout, ctaBand, appShot, overlayShot, facts, keys, icon } from "../../build/components.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "기능", path: "/ko/features/" },
];

export default {
  id: "features",
  lang: "ko",
  path: "/ko/features/",
  title: "AI Translator 기능: 자막, 용어집, 내보내기",
  description:
    "5개 언어 실시간 번역 자막, 자막 바, 채팅용 입력 번역, 용어집, 기록, TXT/SRT/Markdown 내보내기. 모두 내 컴퓨터에서 오프라인으로 실행됩니다.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  body: () => `
${pageHero({ crumbs, title: "내 컴퓨터에서 실행되는 회의 실시간 번역 기능", lead: "AI Translator가 지금 할 수 있는 일을 앱에서 실제로 작동하는 그대로 소개합니다. 유료 요금제에만 있는 기능은 분명히 표시했습니다." })}

<section class="section-tight"><div class="container">
<h2 class="sr-only">기능 한눈에 보기</h2>
<div class="grid grid-4 reveal">
<a class="card card-link" href="#live-translation"><h3>실시간 번역</h3><p class="muted">5개 언어, 자동 감지</p></a>
<a class="card card-link" href="#subtitle-bar"><h3>자막 바</h3><p class="muted">끌기, 잠금, 글자 크기 조절</p></a>
<a class="card card-link" href="#transcript"><h3>대본</h3><p class="muted">기록, 내보내기(Pro)</p></a>
<a class="card card-link" href="#glossary"><h3>용어집</h3><p class="muted">이름과 용어(Pro)</p></a>
<a class="card card-link" href="#type-and-translate"><h3>입력 번역</h3><p class="muted">상대방의 언어로 채팅</p></a>
<a class="card card-link" href="#audio-source"><h3>오디오 소스</h3><p class="muted">모든 회의 앱, 봇 없이</p></a>
<a class="card card-link" href="#shortcuts"><h3>단축키와 트레이</h3><p class="muted">회의를 떠나지 않고 조작</p></a>
<a class="card card-link" href="#models"><h3>모델과 하드웨어</h3><p class="muted">Standard와 Lite 팩</p></a>
<a class="card card-link" href="#performance"><h3>성능</h3><p class="muted">측정값과 측정 조건</p></a>
</div>
</div></section>

<section class="section band-dark" id="on-device-ai"><div class="container">
${sectionHead({ eyebrow: "기기 내 AI", title: "회의를 클라우드에 올리지 않는 AI 번역", text: "음성 인식용과 번역용, 두 개의 AI 모델이 내 컴퓨터에서 직접 실행됩니다. 음성이나 회의 내용을 서버나 클라우드 AI 서비스로 보내는 단계는 없습니다.", center: true })}
${dataFlow("ko")}
<div class="grid grid-3">
${feature({ icon: "cpu", title: "로컬에서 실행되는 두 AI 모델", text: "하나는 음성을 인식하고, 하나는 번역합니다. 둘 다 한 번만 내려받으면 GPU나 CPU를 이용해 내 컴퓨터에서 실행됩니다.", accent: true })}
${feature({ icon: "zap", title: "돌아가지 않으니 지연이 낮습니다", text: "서버를 오갈 필요가 없어 화자가 문장을 마치면 바로 번역이 나타납니다. Mac M4 Pro에서 중앙값은 1.1초 미만이며, 측정 조건은 아래 '성능' 부분에 있습니다." })}
${feature({ icon: "lock", title: "대화 데이터는 내 컴퓨터에 남습니다", text: "음성은 RAM에만 있고, 받아쓰기와 번역은 내 컴퓨터에 남습니다. 기록은 기본으로 꺼져 있으며, 켜더라도 내 컴퓨터에 암호화되어 저장됩니다." })}
</div>
</div></section>

<section class="section" id="live-translation"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">실시간 번역</span>
<h2>듣기, 인식, 번역, 자막 표시를 한 흐름으로</h2>
<p>AI Translator는 컴퓨터에서 재생되는 소리를 가져와 문장 단위로 나누고, 음성을 인식하고 번역해 자막 바에 보여 줍니다. Mac M4 Pro에서는 화자가 문장을 마친 뒤 약 1초(중앙값) 만에 번역 전체가 나타납니다. 다른 컴퓨터는 더 느릴 수 있으니 <a href=\"#performance\">측정 결과</a>를 참조하세요.</p>
${checkList([
  "원본 음성과 번역 모두 <strong>다섯 가지 언어</strong>: 영어, 중국어(中文), 일본어(日本語), 한국어, 베트남어(Tiếng Việt). 앞으로 더 많은 언어를 추가할 계획입니다(일정은 아직 없습니다)",
  "<em>회의에서 사용하는 언어</em>에서 체크한 언어 중에서 말하는 언어를 <strong>자동 감지</strong>하며, 어떤 언어로 말할지 알면 <em>원본 언어</em>에서 한 언어로 <strong>고정</strong>할 수 있습니다",
  "이미 읽고 싶은 언어로 된 문장은 다시 번역하지 않고 그대로 보여 줍니다",
  "아직 확정되지 않은 문장은 흐리게 나타났다가, 화자가 말을 이어 가면 완성된 문장으로 바뀝니다",
  "음악이나 무음 구간에서 음성 인식이 지어내기 쉬운 '유령' 문장을 걸러 냅니다",
  "인식한 중국어는 간체자로 변환합니다",
])}
</div>
<div>
${appShot({ slug: "app-home-free", lang: "ko", alt: "언어 카드가 있는 AI Translator 메인 화면: 번역 언어와 회의에서 사용하는 언어", caption: "언어 카드: 읽고 싶은 언어와 회의에서 쓰일 수 있는 언어를 고릅니다." })}
</div>
</div>
${callout({ title: "자막은 한 방향입니다: 회의에서 나에게로.", text: "AI Translator는 컴퓨터에서 나오는 소리를 내 언어로 번역합니다. 내 목소리를 회의 쪽으로 번역하는 기능은 아직 없습니다. 채팅에서 글로 답하려면 <a href=\"#type-and-translate\">입력 번역</a>을 쓰세요. 내 언어로 입력하면 앱이 번역을 채팅 입력란에 붙여 넣습니다. 양쪽 모두 앱을 설치하면 각자 상대방의 자막을 볼 수 있습니다." })}
</div></section>

<section class="section section-alt" id="subtitle-bar"><div class="container">
<div class="split reverse">
<div class="stack-lg reveal">
<span class="eyebrow">자막 바</span>
<h2>회의를 방해하지 않는, 원하는 대로 바꿀 수 있는 플로팅 바</h2>
<p>자막 바는 반투명 배경을 가진 테두리 없는 독립 창입니다. 항상 위에 떠 있으면서도 회의 앱의 포커스를 빼앗지 않으므로, 평소처럼 채팅에 입력하거나 버튼을 누를 수 있습니다.</p>
${checkList([
  "<strong>끌어서</strong> 옮기고, 가장자리나 모서리를 끌어 크기를 바꿉니다. 위치와 크기는 화면마다 기억됩니다",
  "<strong>글자 크기</strong> 14~48px, <strong>글자 색 5가지</strong>(흰색, 노란색, 초록색, 하늘색, 주황색), <strong>배경 색 5가지</strong>, 배경 불투명도 0~100%",
  "<strong>잠금</strong>: 마우스 클릭이 바를 통과하고 버튼도 걸리적거리지 않습니다. 단축키나 트레이 메뉴에서 잠금 해제",
  "최근 1,000개 문장을 보관하며, 마우스 휠이나 단축키로 <strong>이전 문장을 다시 보고</strong>, <em>최신</em> 버튼으로 현재 문장으로 돌아옵니다",
  "번역 위에 작은 글씨로 <strong>원문</strong> 표시(기본으로 켜져 있으며 끌 수 있습니다)",
  "모서리의 작은 표시: 소리를 감지해 듣는 중, 모델 불러오는 중, 처리가 밀림, 남은 번역 시간 5분 미만",
])}
<p class="more-link"><a href="/ko/guide/subtitle-bar-and-shortcuts/">자막 바와 단축키 사용법 알아보기 ${icon("arrow-right")}</a></p>
</div>
<div class="stack-lg">
${overlayShot({ slug: "overlay-custom", lang: "ko", alt: "큰 글자 크기로 남색 배경에 노란 글자를 표시한 자막 바", caption: "같은 바를 노란 글자, 남색 배경, 크기 26으로 바꾼 모습." })}
${appShot({ slug: "app-settings-subtitles", lang: "ko", alt: "자막 설정: 예문 미리보기, 글자 크기, 글자 색, 배경 색, 배경 불투명도, 원문 표시 옵션", caption: "설정 › 자막: 미리보기와 바가 바로 바뀝니다." })}
</div>
</div>
</div></section>

<section class="section" id="audio-source"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-settings-audio", lang: "ko", alt: "오디오 설정: 입력 소스는 ‘컴퓨터 오디오 + 마이크’, 오디오 소스(Zoom만), 마이크 선택, 마이크 소리를 낮춘다는 안내, ‘마이크 잡음 필터’ 스위치, 100 ms로 설정된 문장을 끝내는 정지 시간 슬라이더", caption: "설정 › 오디오: 시스템 전체 또는 앱 하나만 듣기(macOS)." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">오디오 소스</span>
<h2>어떤 회의 앱이든, 봇도 플러그인도 없이</h2>
<p>앱이 시스템 오디오를 가져오기 때문에 AI Translator는 소리가 나는 것이라면 무엇이든 쓸 수 있습니다: Zoom, Microsoft Teams, Google Meet, Zalo PC, 웨비나, 동영상, 온라인 강좌, 컴퓨터로 보는 라이브 방송(<a href="/ko/solutions/livestream-translation/">라이브 방송 번역</a>).</p>
${checkList([
  "<strong>macOS:</strong> 시스템 전체(앱 자신 제외) 또는 소리를 내고 있는 앱 하나만 들을 수 있어, 다른 앱의 알림음을 실수로 번역하지 않습니다",
  "<strong>Windows:</strong> 기본 재생 장치 또는 직접 고른 장치",
  "헤드폰을 꽂거나 블루투스를 연결해 재생 장치가 바뀌면 소스가 자동으로 다시 열립니다",
  "<strong>문장을 끝내는 정지 시간</strong>은 50~800&nbsp;ms로 조절할 수 있습니다. 짧으면 자막이 빨리 나오고, 길면 문장이 덜 잘립니다",
])}
<p>macOS에서는 처음 '시작'을 누를 때 시스템이 <em>시스템 오디오 녹음</em> 권한을 묻습니다. 마이크가 들어간 입력 소스를 고르면 <em>마이크</em> 권한도 묻습니다. <a href="/ko/guide/macos-audio-permission/">오디오 권한을 주는 방법 보기</a>. Windows에서는 이 권한이 필요 없습니다.</p>
<h3 id="microphone">회의실 목소리도 번역하기</h3>
<p><strong>설정 › 오디오 › 입력 소스</strong>에서 세 가지 소스 중 하나를 고릅니다. 모든 요금제에서 쓸 수 있습니다.</p>
${checkList([
  "<strong>컴퓨터 오디오</strong>(기본): 온라인 회의, 동영상, 웨비나",
  "<strong>마이크</strong>: 대면 회의나 강의처럼 방 안에서 말하는 사람",
  "<strong>컴퓨터 오디오 + 마이크</strong>: 온라인 참석자와 회의실 참석자가 함께 있는 하이브리드 회의. 온라인 참석자가 말하는 동안에는 같은 문장이 두 번 번역되지 않도록 마이크 소리를 낮춥니다. 그때 회의실에서 동시에 말하면 놓칠 수 있습니다. 헤드폰을 쓰면 가장 좋습니다",
  "<strong>마이크 잡음 필터</strong>(기본 켜짐): 키보드 소리, 펜 소리, 책상 두드리는 소리를 무시합니다. ‘OK’ 같은 한두 단어짜리 대답은 놓칠 수 있으니, 조용한 방에서는 이 스위치를 꺼서 남기세요",
])}
<p>노트북 마이크는 조용한 방에서 가까이(약 1&nbsp;m) 있는 사람의 말을 가장 잘 듣습니다. 넓은 방에서는 외장 마이크나 회의용 마이크를 쓰세요. 마이크로 입력받을 때도 앱은 50&nbsp;ms 동안 말이 멈추면 문장을 끝내며, 컴퓨터 오디오와 같습니다. 실제 말에는 짧은 쉼이 많아서 문장이 조각나면, 설정 › 오디오의 <em>문장을 끝내는 정지 시간</em> 슬라이더를 300~500&nbsp;ms 정도로 올려 보세요. 대신 자막이 더 늦게 나옵니다. 마이크 소리도 사용자의 언어로만 번역되며, 앱이 회의에 소리를 내보내지는 않습니다. <a href="/ko/guide/macos-audio-permission/#microphone-permission">마이크 권한</a>을 참고하세요.</p>
</div>
</div>
</div></section>

<section class="section section-alt" id="transcript"><div class="container">
${sectionHead({ eyebrow: "대본, 기록, 내보내기", title: "들은 내용을 원하는 방식으로 남기기", text: "현재 세션의 대본은 모든 요금제에서 쓸 수 있습니다. 기록 저장과 파일 내보내기는 Pro 기능입니다.", center: true })}
<div class="split">
<div>
${appShot({ slug: "app-transcript", lang: "ko", alt: "시간, 원문, 번역이 있는 대본과 검색창, 모두 복사 버튼, 내보내기 형식 선택", caption: "대본: 검색, 복사, TXT·SRT·Markdown으로 내보내기." })}
</div>
<div class="stack-lg reveal">
${checkList([
  "<strong>대본:</strong> 각 행에 시간, 원문, 번역이 있으며 검색과 모두 복사는 모든 요금제에서 쓸 수 있습니다",
  "TXT, SRT, Markdown으로 <strong>내보내기</strong>. SRT에서는 텍스트를 번역으로 할지 원문으로 할지 고를 수 있습니다 <span class=\"badge badge-pro\">Pro</span>",
  "<strong>세션 기록:</strong> 세션을 하나씩 보고, 열고, 삭제하거나 한꺼번에 삭제 <span class=\"badge badge-pro\">Pro</span>",
  "기록은 <strong>기본으로 꺼져</strong> 있습니다. 켜면 내 컴퓨터에 암호화되어 저장되며, 키는 키체인(macOS) 또는 자격 증명 관리자(Windows)에 보관됩니다",
  "버튼 하나로 이 컴퓨터에서 <strong>기록과 용어집 삭제</strong>(확인 후. 모델까지 삭제하는 별도 버튼도 있음), 모든 요금제에서 가능",
])}
<p class="more-link"><a href="/ko/guide/history-and-export/">기록과 내보내기 가이드 읽기 ${icon("arrow-right")}</a></p>
${appShot({ slug: "app-history", lang: "ko", alt: "저장된 세션을 날짜와 시간, 분, 문장 수, 미리보기와 함께 보여 주는 기록 화면", caption: "기록: 내 컴퓨터에 저장된 세션." })}
</div>
</div>
</div></section>

<section class="section" id="glossary"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-glossary", lang: "ko", alt: "원문 용어와 번역 쌍, CSV 가져오기·내보내기 버튼이 있는 용어집", caption: "용어집: 추가, 편집, 삭제, CSV 가져오기와 내보내기." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">용어집 <span class="badge badge-pro">Pro</span></span>
<h2>이름과 용어를 번역에 힌트로 전달</h2>
<p>제품 이름, 거래처 이름, 업계 용어를 '원문 → 번역' 쌍으로 추가하세요. 문장에 그중 하나가 있으면 앱이 번역에 힌트로 전달합니다.</p>
${checkList([
  "최대 <strong>500</strong>개, CSV 가져오기와 내보내기 지원(2열, UTF-8)",
  "대소문자를 구분하지 않고 찾으며, 중국어·일본어·한국어 용어는 단어 중간에서도 일치합니다",
  "문장마다 관련 항목을 최대 20개 사용합니다",
])}
<p class="small muted">용어는 번역에 주는 힌트이므로 매번 정확히 쓰인다고 보장할 수는 없습니다. 앱에도 그렇게 안내되어 있습니다.</p>
<p class="more-link"><a href="/ko/guide/glossary/">용어집 가이드 읽기 ${icon("arrow-right")}</a></p>
</div>
</div>
</div></section>

<section class="section section-alt" id="type-and-translate"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">입력 번역</span>
<h2>쓰고 있는 채팅 입력란에서 바로 상대방의 언어로 채팅</h2>
<p>쓰고 있는 앱의 채팅 입력란에서 ${keys(["⌃", "⌥", "G"])}(Windows: ${keys(["Ctrl", "Alt", "G"])})를 누르세요. 떠 있는 입력 상자에 내 언어로 입력하면 바로 아래에 번역이 나타납니다. Enter를 누르면 번역이 채팅 입력란에 붙여 넣어지고, 확인한 뒤 Enter를 한 번 더 눌러 보냅니다.</p>
${checkList([
  "자막 설정에서 가져온 <strong>대화 상대의 언어</strong> 또는 직접 고른 언어로 번역합니다",
  "<strong>활성화된 모든 요금제</strong>에 포함되며 체험 중인 Free에서도 쓸 수 있고, 번역 시간을 <strong>쓰지 않습니다</strong>",
  "번역은 내 컴퓨터에서 이루어지며, 입력한 내용과 그 번역은 밖으로 나가지 않습니다",
  "평소 쓰는 키보드와 입력기로 입력합니다. 번역에 실패하면 앱이 원문을 붙여 넣는 일은 없습니다",
])}
<p class="small muted">macOS에서 자동 붙여넣기에는 손쉬운 사용 권한이 필요합니다. 권한이 없으면 앱이 번역을 복사하므로 ⌘V로 붙여 넣으세요. <a href="/ko/guide/type-and-translate/">입력 번역 가이드</a>를 참조하세요.</p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "ko", alt: "한국어 메시지와 그 아래 영어 번역이 있는 입력 번역 상자", caption: "입력 번역 상자: Enter를 누르면 번역이 채팅 입력란에 붙여 넣어집니다." })}
</div>
</div>
</div></section>

<section class="section" id="shortcuts"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">단축키와 시스템 트레이</span>
<h2>회의를 떠나지 않고 조작</h2>
<p>전역 단축키 여섯 개는 AI Translator가 앞에 있는 창이 아니어도 작동합니다. 각각 '설정 › 단축키'에서 바꿀 수 있습니다.</p>
<div class="table-wrap" role="region" aria-label="키보드 단축키" tabindex="0"><table>
<thead><tr><th scope="col">동작</th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">번역 시작 또는 중지</th><td>${keys(["⌃", "⌥", "T"])}</td><td>${keys(["Ctrl", "Alt", "T"])}</td></tr>
<tr><th scope="row">자막 표시 또는 숨기기</th><td>${keys(["⌃", "⌥", "H"])}</td><td>${keys(["Ctrl", "Alt", "H"])}</td></tr>
<tr><th scope="row">자막 잠금 또는 잠금 해제</th><td>${keys(["⌃", "⌥", "L"])}</td><td>${keys(["Ctrl", "Alt", "L"])}</td></tr>
<tr><th scope="row">자막 위로 스크롤(이전 문장)</th><td>${keys(["⌃", "⌥", "PageUp"])}</td><td>${keys(["Ctrl", "Alt", "PageUp"])}</td></tr>
<tr><th scope="row">자막 아래로 스크롤(최신 문장)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
<tr><th scope="row">입력 번역 상자 열기 또는 닫기</th><td>${keys(["⌃", "⌥", "G"])}</td><td>${keys(["Ctrl", "Alt", "G"])}</td></tr>
</tbody></table></div>
<p class="small muted">macOS에서 ⌃는 Control, ⌥는 Option입니다. 단축키에는 Ctrl, Alt, Cmd/Win 중 하나 이상이 있어야 합니다.</p>
<p>메뉴 막대 아이콘(macOS)이나 시스템 트레이 아이콘(Windows)에서 번역 시작·중지, 자막 표시·숨기기와 잠금, 메인 창 열기를 할 수 있습니다. 창을 닫으면 앱은 트레이로 숨을 뿐입니다. 완전히 끝내려면 <em>종료</em>를 고르세요.</p>
</div>
<div>
${appShot({ slug: "app-settings-hotkeys", lang: "ko", alt: "macOS의 기본 단축키 여섯 개를 보여 주는 단축키 설정", caption: "설정 › 단축키: '변경'을 누른 다음 새 키 조합을 누릅니다." })}
</div>
</div>
</div></section>

<section class="section section-alt" id="models"><div class="container stack-lg">
<div class="model-intro">
<div class="stack-lg reveal">
<span class="eyebrow">모델과 내 컴퓨터</span>
<h2>모델 팩 두 가지, 앱이 맞는 것을 추천합니다</h2>
<p>인식 모델과 번역 모델은 한 번만 내려받으면 그 후로는 모두 내 컴퓨터에서 실행됩니다. 앱은 RAM, 남은 디스크 공간, 그래픽 카드를 확인해 팩을 추천합니다.</p>
</div>
</div>
<div class="table-wrap reveal" role="region" aria-label="모델 팩 비교" tabindex="0"><table>
<thead><tr><th scope="col"><span class="sr-only">항목</span></th><th scope="col">Standard 팩</th><th scope="col">Lite 팩</th></tr></thead>
<tbody>
<tr><th scope="row">다운로드</th><td>약 2.5GB</td><td>약 1.3GB</td></tr>
<tr><th scope="row">실행 중 RAM(M4 Pro)</th><td>약 2.9GiB</td><td>약 1.8~1.9GiB</td></tr>
<tr><th scope="row">앱이 추천하는 환경</th><td>16GB 이상인 Mac, 또는 16GB 이상에 VRAM 6GB 외장 그래픽 카드가 있는 Windows</td><td>8GB 이상 16GB 미만인 컴퓨터, 또는 적합한 외장 그래픽 카드가 없는 Windows</td></tr>
</tbody></table></div>
<p class="small muted">Lite 팩은 베트남어, 일본어, 한국어, 중국어 음성 인식이 Standard보다 덜 정확합니다. 이 언어들을 자주 듣는다면 Standard 팩을 고르세요.</p>
${facts([
  ["macOS", "macOS 14.2 이상, Apple 실리콘(M1 이상)<small>Intel Mac용 버전은 없습니다</small>"],
  ["RAM", "최소 8GB, 16GB 권장"],
  ["디스크", "내려받는 모델 크기에 더해 최소 1GB 여유 공간"],
  ["Windows", "Windows 10/11 64비트(x64), AVX2 지원 CPU<small>Standard 팩에는 VRAM 6GB 이상의 외장 그래픽 카드를 권장합니다. 아직 코드 서명이 없어 설치할 때 SmartScreen이 경고할 수 있습니다. Windows의 지연은 내장 그래픽 노트북 한 대에서만 예비 테스트를 했으며 Mac M4 Pro보다 느립니다('성능' 참조)</small>"],
])}
</div></section>

<section class="section" id="performance"><div class="container">
${sectionHead({ eyebrow: "성능", title: "측정 조건과 함께 공개하는 실제 측정값", text: "측정한 기기에서 실제로 측정한 값만 공개하며, 테스트하지 않은 기기도 분명히 밝힙니다.", center: true })}
<div class="table-wrap reveal" role="region" aria-label="측정한 성능" tabindex="0"><table>
<thead><tr><th scope="col">측정(Mac M4 Pro 24GB, macOS 26, Apple GPU)</th><th scope="col">Standard 팩</th><th scope="col">Lite 팩</th></tr></thead>
<tbody>
<tr><th scope="row">지연 중앙값(p50): 화자가 문장을 마친 뒤 번역 전체가 나타날 때까지</th><td>0.76~1.03초</td><td>0.61~0.84초</td></tr>
<tr><th scope="row">p90 지연</th><td>0.94~1.34초</td><td>0.73~1.14초</td></tr>
<tr><th scope="row">번역의 첫 단어가 나타날 때까지(p50)</th><td>0.63~0.69초</td><td>0.52~0.57초</td></tr>
<tr><th scope="row">실행 중 RAM</th><td>2.9GiB</td><td>1.8~1.9GiB</td></tr>
</tbody></table></div>
<div class="grid grid-2">
${feature({ icon: "gauge", title: "긴 세션", text: "5시간 23분 동안 이어진 연속 세션 한 번(영어 강의 동영상, 애드혹 서명 릴리스 빌드): 6,019개 구간, 오류 없음, 지연 중앙값 0.48초. 2시간 안정성 테스트에서는 어떤 구성 요소도 다시 시작되지 않았습니다." })}
${feature({ icon: "languages", title: "번역과 인식 품질", text: "앱의 자체 번역 경로로 베트남어가 포함된 여덟 방향을 내부 테스트한 결과, Standard 팩의 번역 모델은 자동 번역 품질 점수(0~1, 아래 표)에서 평균 약 0.84를 기록했습니다. 번역 모델은 별도의 테스트 세트에서 여러 모델을 비교해 골랐습니다. 깨끗한 낭독 음성에서 Standard 팩의 베트남어 인식 단어 오류율은 8.7%입니다. 이는 낭독 음성이며 실제 회의 대화가 아닙니다." })}
</div>
<h3 class="reveal" id="quality-by-direction">방향별 번역 품질과 인식 품질</h3>
<p class="reveal">자동 번역 품질 점수는 앱의 자체 번역 경로(실제 사용과 같은 구성)로 방향마다 100문장(베트남어 → 중국어, 일본어, 한국어는 40문장)을 측정했습니다. 0~1 사이의 상대 점수로 높을수록 좋으며, <strong>정확도 백분율이 아닙니다</strong>.</p>
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">방향(텍스트)</th><th scope="col">Standard 팩</th><th scope="col">Lite 팩</th></tr></thead>
<tbody>
<tr><th scope="row">영어 → 베트남어</th><td>0.842</td><td>0.841</td></tr>
<tr><th scope="row">中文 → 베트남어</th><td>0.829</td><td>0.831</td></tr>
<tr><th scope="row">日本語 → 베트남어</th><td>0.830</td><td>0.815</td></tr>
<tr><th scope="row">한국어 → 베트남어</th><td>0.834</td><td>0.822</td></tr>
<tr><th scope="row">베트남어 → 영어</th><td>0.821</td><td>0.822</td></tr>
<tr><th scope="row">베트남어 → 中文</th><td>0.836</td><td>0.821</td></tr>
<tr><th scope="row">베트남어 → 日本語</th><td>0.847</td><td>0.845</td></tr>
<tr><th scope="row">베트남어 → 한국어</th><td>0.851</td><td>0.842</td></tr>
</tbody></table></div>
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">음성 인식(오류율, 낮을수록 좋음)</th><th scope="col">Standard 팩</th><th scope="col">Lite 팩</th></tr></thead>
<tbody>
<tr><th scope="row">영어(단어 오류)</th><td>5.4%</td><td>6.6%</td></tr>
<tr><th scope="row">베트남어(단어 오류)</th><td>8.7%</td><td>22.5%</td></tr>
<tr><th scope="row">中文(글자 오류)</th><td>5.6%</td><td>9.6%</td></tr>
<tr><th scope="row">日本語(글자 오류)</th><td>4.5%</td><td>13.1%</td></tr>
<tr><th scope="row">한국어(글자 오류)</th><td>4.1%</td><td>8.2%</td></tr>
</tbody></table></div>
<p class="small muted reveal">읽는 법: 번역 테스트 세트는 일상 구어에 가까워 회의 발화의 대략적인 지표일 뿐입니다. 인식은 깨끗한 낭독 음성(언어마다 약 15분)에서 측정했으며 실제 회의 대화가 아닙니다. 협대역 오디오(통화 모드의 블루투스 헤드셋 같은 소리)를 흉내 낸 테스트에서는 오류율이 올라갔으며, 실제 헤드셋으로는 테스트하지 않았습니다. 위의 여덟 방향은 모두 베트남어가 포함된 방향입니다. 영어, 中文, 日本語, 한국어 사이의 나머지 12개 방향도 작동하지만 아직 품질 점수가 없습니다. Lite 팩은 베트남어, 일본어, 한국어, 중국어 인식이 눈에 띄게 덜 정확합니다.</p>
${callout({ kind: "warn", title: "측정하지 않았고 약속하지 않는 것", text: "위의 수치는 모두 Mac M4 Pro 한 대에서, 문장을 끝내는 정지 시간을 300&nbsp;ms로 두고 측정했습니다(앱의 현재 기본값은 50&nbsp;ms이며, 5시간 세션은 기본값으로 진행했습니다). 측정하지 않은 것: M1 Mac, 8GB 컴퓨터, Windows 외장 그래픽 카드, 배터리와 전력 사용량, 실제 회의 대화나 블루투스 헤드셋을 거친 정확도, 베트남어가 포함되지 않은 방향의 번역 품질(작동은 하지만 공개할 품질 점수가 없습니다). Windows 노트북 한 대(Core i5-1345U, 내장 그래픽, RAM 32GB, Windows 11, 설정마다 17~23문장 세션 6회)에서 한 예비 테스트에서는 지연 중앙값이 Lite 팩 1.3~2.6초, Standard 팩 2.7~5.4초로 지연 목표를 충족하지 못했습니다. 이 노트북은 최소 사양보다 성능이 좋으므로, 이는 저사양 PC의 수치가 아닙니다." })}
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "요금제별", title: "어떤 기능이 어떤 요금제에 포함되는지", center: true })}
<div class="table-wrap reveal" role="region" aria-label="요금제별 기능" tabindex="0"><table class="compare">
<thead><tr><th scope="col">기능</th><th scope="col">Free(체험)</th><th scope="col">Monthly</th><th scope="col">6 Months</th><th scope="col">Yearly</th></tr></thead>
<tbody>
<tr><th scope="row">실시간 번역 자막, 5개 언어</th><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">맞춤 설정 가능한 자막 바, 단축키, 트레이</th><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">대본 보기, 검색, 복사</th><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">용어집(최대 500개)</th><td><span class="no">아니요</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">세션 기록 저장</th><td><span class="no">아니요</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">TXT, SRT, Markdown으로 내보내기</th><td><span class="no">아니요</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">번역 시간</th><td>하루 30분, 10일 동안</td><td>30일마다 50시간</td><td>180일 동안 30일마다 100시간</td><td>365일 동안 무제한</td></tr>
<tr><th scope="row">가격(VietQR, VND)</th><td>0 ₫</td><td>50,000 ₫</td><td>269,000 ₫</td><td>500,000 ₫</td></tr>
<tr><th scope="row">가격(해외 카드, USD, 세금 별도)</th><td>—</td><td>US$3.99</td><td>US$21.99</td><td>US$39.99</td></tr>
</tbody></table></div>
<p class="center-text reveal"><a class="btn btn-primary" href="/ko/pricing/">전체 요금 상세 보기 ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "실제 회의에서 써 보세요", text: "하루 30분, 10일 무료 체험. 카드도 계정도 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/guide/quick-start/", label: "빠른 시작 가이드 읽기" } })}
`,
};
