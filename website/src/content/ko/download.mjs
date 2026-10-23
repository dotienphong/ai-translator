import { RELEASE } from "../../site.mjs";
import { pageHero, sectionHead, steps, callout, facts, ctaBand, feature, icon, faq, cmdBlock, chips, flow, osTabs } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "다운로드", path: "/ko/download/" },
];

const mailto = (subject, body) =>
  `mailto:support@aitranslator.vn?subject=${encodeURIComponent(subject)}&amp;body=${encodeURIComponent(body.join("\n"))}`;

// 지원팀은 영어나 베트남어로 답하므로 항목 이름에 영어를 함께 적습니다.
const MAILTO_MAC = mailto("AI Translator installer request (macOS)", [
  "AI Translator 팀께 (Hello AI Translator team),",
  "",
  "macOS 설치 파일(.dmg)을 받고 싶습니다. (I would like to receive the macOS installer.)",
  "",
  "- 이름 (Full name):",
  "- Mac 모델과 칩(예: MacBook Air M2) (Mac model and chip):",
  "- macOS 버전 (macOS version):",
  "- RAM:",
  "- 사용할 곳(Zoom, Teams, Meet, Zalo, 웨비나 등) (I plan to use it with):",
  "- 번역이 필요한 언어(영어, 중국어, 일본어, 한국어, 베트남어) (Languages I need translated):",
  "",
  "감사합니다! (Thank you!)",
]);

const MAILTO_WIN = mailto("AI Translator installer request (Windows)", [
  "AI Translator 팀께 (Hello AI Translator team),",
  "",
  "Windows 설치 파일(.exe)을 받고 싶습니다. (I would like to receive the Windows installer.)",
  "",
  "- 이름 (Full name):",
  "- PC 모델과 프로세서(예: Dell 노트북, Intel Core i5-1235U) (PC model and processor):",
  "- Windows 버전(10 또는 11) (Windows version):",
  "- RAM:",
  "- 그래픽 카드(있는 경우) (Graphics card):",
  "- 사용할 곳(Zoom, Teams, Meet, Zalo, 웨비나 등) (I plan to use it with):",
  "- 번역이 필요한 언어(영어, 중국어, 일본어, 한국어, 베트남어) (Languages I need translated):",
  "",
  "감사합니다! (Thank you!)",
]);

const INSTALL_CMD = "curl -fsSL https://aitranslator.vn/install.sh | bash";
const INSTALL_CMD_BETA = "curl -fsSL https://aitranslator.vn/install.sh | bash -s -- --beta";
const INSTALL_CMD_REVIEW = "curl -fsSL https://aitranslator.vn/install.sh -o install.sh && less install.sh && bash install.sh";
const WIN_CMD = "irm https://aitranslator.vn/install.ps1 | iex";
const WIN_CMD_BETA = "& ([scriptblock]::Create((irm https://aitranslator.vn/install.ps1))) -Beta";
const WIN_CMD_REVIEW = "$s = irm https://aitranslator.vn/install.ps1; $s | more; iex $s";

const COPY = { copy: "복사", copied: "복사됨" };

const DL_FAQ = [
  {
    q: "명령 한 줄은 무엇을 하나요? 안전한가요?",
    a: `<p>명령은 <strong>aitranslator.vn</strong>에서 작은 스크립트를 내려받습니다. 스크립트는 컴퓨터를 확인하고, 최신 버전 번호를 읽고, <strong>releases.aitranslator.vn</strong>에서 설치 파일과 SHA-256 체크섬을 내려받아 체크섬을 비교한 다음, 앱을 설치하고 엽니다. 데이터를 보내지 않으며 관리자 권한도 필요 없습니다.</p><p>인터넷에서 붙여 넣은 명령을 실행한다는 것은 언제나 그 출처를 믿는다는 뜻입니다. 실행하기 전에 스크립트를 읽어 보고 싶다면 사용하는 운영체제 가이드의 '먼저 스크립트를 읽고 싶어요'를 여세요. SHA-256 체크섬은 파일과 같은 곳에서 제공되므로 주로 손상된 다운로드를 막아 줄 뿐, 출처에 대한 신뢰를 대신하지는 않습니다.</p>`,
  },
  {
    q: "왜 .dmg나 .exe 다운로드 버튼이 없나요?",
    a: `<p>현재 빌드는 아직 Apple이나 Microsoft의 서명을 받지 않았습니다(Apple Developer ID도, Windows 코드 서명 인증서도 아직 없습니다). 브라우저로 내려받은 파일에는 '인터넷에서 다운로드됨' 표시가 붙기 때문에, macOS는 .dmg를 처음 실행할 때 막고(확인 없이 열기), Windows SmartScreen은 .exe에 대해 경고할 수 있습니다. 터미널이나 PowerShell 명령으로 내려받은 파일에는 이 표시가 붙지 않으므로 앱이 바로 설치되고 열립니다. 인증서를 받으면 바로 내려받는 버튼을 추가하겠습니다.</p>`,
  },
  {
    q: "업데이트나 삭제는 어떻게 하나요?",
    a: `<p>앱이 스스로 새 버전을 확인합니다(설정 › 일반). 같은 설치 명령을 언제든 다시 실행해 최신 버전을 설치할 수도 있으며, 스크립트가 실행 중인 앱을 끝내고 이전 버전을 바꿉니다. 삭제하려면 먼저 앱 안에서 모델과 데이터를 삭제한 다음 앱을 지우세요. <a href="/ko/guide/install-macos/#uninstall">macOS</a>와 <a href="/ko/guide/install-windows/#uninstall">Windows</a> 삭제 가이드를 참조하세요.</p>`,
  },
  {
    q: "Intel 칩 Mac에서 쓸 수 있나요?",
    a: `<p>아직은 안 됩니다. AI Translator에는 Apple 실리콘 칩(M1 이상)의 Mac과 macOS 14.2 이상이 필요합니다. Mac이 조건을 충족하지 않으면 설치 명령이 멈추고 이유를 알려 줍니다.</p>`,
  },
  {
    q: "어떤 Windows PC에서 실행되나요?",
    a: `<p>Windows 10 또는 11 64비트(x64)에, AVX2를 지원하는 CPU와 8GB 이상의 RAM이 필요합니다. Windows ARM64는 아직 지원하지 않습니다. AVX2가 없거나 RAM이 8GB 미만이면 앱이 이유를 설명하고 모델을 내려받지 못하게 합니다. Windows의 지연은 내장 그래픽 노트북 한 대에서만 예비 테스트를 했으며 Mac M4 Pro보다 느리므로, 이에 대해서는 약속드리지 않습니다.</p>`,
  },
  {
    q: "앱이 스스로 업데이트되나요?",
    a: `<p>'설정 › 일반 › 업데이트 채널'에 안정 버전과 Beta, 두 업데이트 채널이 있습니다. 앱은 시작할 때와 24시간마다 확인하며, 채널을 바꾸면 바로 확인합니다. 지금 바로 확인하려면 '설정 › 일반' 위쪽 블록에서 '버전 …' 옆의 <strong>업데이트 확인</strong>을 누르거나(확인할 때마다 'HH:MM:SS에 확인함'이 표시됩니다), 앱 아이콘 메뉴에서 '업데이트 확인…'을 고르세요. macOS에서는 업데이트할 때마다 키체인 승인을 한 번 다시 요청합니다. Windows에서는 따로 묻는 것이 없습니다.</p>`,
  },
];

const macPanel = () => `
${chips([["command", "macOS 14.2 이상"], ["cpu", "Apple 실리콘(M1 이상)"], ["download", "설치 파일 약 9MB"], ["shield", "관리자 암호 필요 없음"]])}
${flow([
  { title: "터미널 열기", text: "<p><span class='nowrap'><kbd>⌘</kbd> + <kbd>Space</kbd></span>를 누르고 <strong>터미널</strong>을 입력한 뒤 Enter를 누릅니다.</p>" },
  {
    title: "이 명령을 붙여 넣고 Enter 누르기",
    text: `<p><strong>복사</strong>를 누른 다음 <span class='nowrap'><kbd>⌘</kbd> + <kbd>V</kbd></span>로 터미널에 붙여 넣습니다.</p>${cmdBlock({ cmd: INSTALL_CMD, ...COPY, label: "macOS에 AI Translator를 설치하는 명령", term: "Terminal" })}<p class="small">암호가 필요 없습니다. 같은 명령을 언제든 다시 실행하면 최신 버전으로 업데이트됩니다.</p>`,
  },
  { title: "앱이 열릴 때까지 기다리기", text: "<p>1분 정도 걸립니다. 명령이 최신 버전을 내려받아 SHA-256을 확인하고, AI Translator를 응용 프로그램 폴더에 복사한 뒤 엽니다. 처음 <strong>시작</strong>을 누르면 macOS가 시스템 오디오 녹음 권한을 물어보니 '허용'을 고르세요.</p>" },
])}
<div class="panel-more">
<h3>옵션과 문제 해결</h3>
${faq(
  [
    {
      q: "왜 '확인 없이 열기' 단계가 없나요?",
      a: "<p>macOS 버전은 아직 Apple의 공증을 받지 않았기 때문에(Apple Developer ID가 아직 없습니다), 브라우저로 내려받은 .dmg는 처음 실행할 때 macOS가 막습니다. 터미널 명령으로 내려받은 파일에는 macOS가 '인터넷에서 다운로드됨' 표시를 붙이지 않으므로 앱이 바로 열립니다. 대신 명령의 출처를 믿어야 합니다. 아래 질문을 참조하세요.</p>",
    },
    {
      q: "먼저 스크립트를 읽고 싶어요",
      a: `<p>스크립트는 <a href="/install.sh">aitranslator.vn/install.sh</a>에 있습니다(약 200줄, 주석 포함). 다음 명령은 스크립트를 내려받아 읽을 수 있게 한 다음에야 실행합니다:</p>${cmdBlock({ cmd: INSTALL_CMD_REVIEW, ...COPY, label: "실행 전에 검토할 수 있도록 스크립트를 내려받는 명령", term: "Terminal" })}`,
    },
    {
      q: "새 빌드를 먼저 써 보기(Beta 채널)",
      a: `<p>기본적으로 명령은 안정 버전을 설치합니다. 새 빌드가 있을 때 먼저 써 보려면(Beta 채널) <code>bash</code> 뒤에 <code>-s -- --beta</code>를 붙이세요:</p>${cmdBlock({ cmd: INSTALL_CMD_BETA, ...COPY, label: "Beta 채널에서 설치하는 명령", term: "Terminal" })}`,
    },
    {
      q: "브라우저로 .dmg를 내려받았더니 macOS가 막았어요",
      a: "<p>가장 빠른 방법은 위의 설치 명령을 실행하는 것입니다. 최신 버전을 덮어서 설치하고 앱이 바로 열립니다. 직접 허용할 수도 있습니다: <strong>시스템 설정 › 개인정보 보호 및 보안</strong>을 열고 맨 아래로 스크롤해 AI Translator 옆의 <strong>확인 없이 열기</strong>를 누른 뒤 암호나 Touch ID로 확인합니다. <a href=\"/ko/guide/install-macos/\">macOS 설치 가이드</a>를 참조하세요.</p>",
    },
    {
      q: "업데이트할 때마다 macOS는 무엇을 묻나요?",
      a: "<p>애드혹 서명 빌드는 릴리스마다 서명이 달라지므로 macOS가 키체인 접근을 다시 묻습니다: Mac 로그인 암호를 묻는 <strong>대화상자 1개</strong>가 나타나니 <strong>항상 허용</strong>을 고르세요. 시스템 오디오 녹음 권한을 한 번 더 물을 수도 있습니다. 처음 설치하는 분에게는 키체인 대화상자가 전혀 나타나지 않습니다. 0.1.0에서 0.1.1로 처음 업데이트할 때만 한 번, 5번 묻습니다.</p>",
    },
    {
      q: ".dmg를 이메일로 받고 싶어요",
      a: `<p><a href="${MAILTO_MAC}">support@aitranslator.vn</a>으로 짧은 이메일을 보내 주세요. .dmg와 SHA-256 체크섬을 답장으로 보내 드립니다. 브라우저로 내려받은 .dmg는 처음 실행할 때 '확인 없이 열기' 단계가 필요합니다.</p>`,
    },
  ],
  { open: false },
)}
</div>
<div class="panel-foot"><p>삭제 방법까지 포함한 단계별 안내가 필요하신가요?</p><a class="btn btn-secondary btn-sm" href="/ko/guide/install-macos/">macOS 전체 가이드 ${icon("arrow-right")}</a></div>
`;

const winPanel = () => `
${chips([["windows", "Windows 10 또는 11, 64비트"], ["cpu", "AVX2 지원 CPU"], ["download", "설치 파일 약 22MB"], ["shield", "관리자 권한 필요 없음"]])}
${flow([
  { title: "PowerShell 열기", text: "<p><kbd>Windows</kbd> 키를 누르고 <strong>PowerShell</strong>을 입력한 뒤 Enter를 누릅니다. 관리자로 실행할 필요는 없습니다.</p>" },
  {
    title: "이 명령을 붙여 넣고 Enter 누르기",
    text: `<p><strong>복사</strong>를 누른 다음 PowerShell에 붙여 넣습니다(마우스 오른쪽 버튼 또는 <span class='nowrap'><kbd>Ctrl</kbd> + <kbd>V</kbd></span>).</p>${cmdBlock({ cmd: WIN_CMD, ...COPY, label: "Windows에 AI Translator를 설치하는 명령", term: "Windows PowerShell", prompt: "PS>" })}<p class="small">같은 명령을 언제든 다시 실행하면 최신 버전으로 업데이트됩니다(설치 프로그램이 실행 중인 앱을 닫고 이전 버전을 바꿉니다).</p>`,
  },
  { title: "앱이 열릴 때까지 기다리기", text: "<p>1분 정도 걸립니다. 명령이 최신 버전을 내려받아 SHA-256을 확인하고, 내 계정에만 설치 프로그램을 조용히 실행한 뒤 AI Translator를 엽니다. Windows에서는 녹음 권한을 묻지 않으며, 앱이 모델을 한 번 내려받으면 번역할 준비가 끝납니다.</p>" },
])}
<div class="panel-more">
<h3>옵션과 문제 해결</h3>
${faq(
  [
    {
      q: "왜 SmartScreen 경고가 나오지 않나요?",
      a: "<p>Windows 버전은 아직 코드 서명이 되어 있지 않습니다(Windows 코드 서명 인증서를 아직 구매하지 않았습니다). SmartScreen은 '인터넷에서 다운로드됨' 표시가 있는 파일만 확인하는데, 이 표시는 브라우저로 파일을 내려받을 때 붙습니다. PowerShell로 내려받은 파일에는 이 표시가 없으므로 설치 프로그램이 바로 실행됩니다. 그래도 명령의 출처는 믿어야 합니다. 아래 질문을 참조하세요.</p>",
    },
    {
      q: "먼저 스크립트를 읽고 싶어요",
      a: `<p>스크립트는 <a href="/install.ps1">aitranslator.vn/install.ps1</a>에 있습니다(주석 포함). 다음 명령은 스크립트를 출력해 읽을 수 있게 한 다음에야 실행합니다:</p>${cmdBlock({ cmd: WIN_CMD_REVIEW, ...COPY, label: "실행 전에 검토할 수 있도록 스크립트를 출력하는 명령", term: "Windows PowerShell", prompt: "PS>" })}`,
    },
    {
      q: "새 빌드를 먼저 써 보기(Beta 채널)",
      a: `<p>기본적으로 명령은 안정 버전을 설치합니다. 새 빌드가 있을 때 먼저 써 보려면(Beta 채널) 이 명령을 쓰세요:</p>${cmdBlock({ cmd: WIN_CMD_BETA, ...COPY, label: "Windows에서 Beta 채널로 설치하는 명령", term: "Windows PowerShell", prompt: "PS>" })}`,
    },
    {
      q: "Windows 11이 앱을 차단했다며 넘어갈 방법이 없어요",
      a: "<p>그것은 <strong>스마트 앱 컨트롤</strong>입니다. 차단 모드에서는 서명이 없고 평판이 없는 앱을 어떻게 설치했든 실행하지 못하게 합니다. 끌 수 있습니다: <strong>Windows 보안 › 앱 및 브라우저 컨트롤 › 스마트 앱 컨트롤 설정</strong>을 열고 <strong>끄기</strong>를 고른 다음 설치 명령을 다시 실행하세요. Windows 코드 서명 인증서를 받으면 이 문제는 없어집니다. <a href=\"/ko/guide/install-windows/#smart-app-control\">자세히</a>.</p>",
    },
    {
      q: "브라우저로 .exe를 내려받았더니 SmartScreen이 경고했어요",
      a: "<p>서명이 없는 빌드에서는 파란색 'Windows의 PC 보호' 화면이 나오는 것이 정상입니다. 저희에게서 받은 파일이고 SHA-256이 일치하면 <strong>추가 정보</strong>를 누르고, 앱 줄에 설치 파일 이름이 표시되는지 확인한 뒤 <strong>실행</strong>을 누르세요. 또는 위의 설치 명령을 실행하면 SmartScreen을 거치지 않고 최신 버전이 설치됩니다. <a href=\"/ko/guide/install-windows/\">단계별 가이드를 참조하세요</a>.</p>",
    },
    {
      q: "회사나 학교 PC에서 명령이 실패해요",
      a: "<p>관리되는 PC는 PowerShell 스크립트를 막을 수 있습니다(제한된 언어 모드). .exe를 쓰거나(이메일로 보내 드릴 수 있습니다) 관리자에게 문의하세요.</p>",
    },
    {
      q: ".exe를 이메일로 받고 싶어요",
      a: `<p><a href="${MAILTO_WIN}">support@aitranslator.vn</a>으로 짧은 이메일을 보내 주세요. .exe와 SHA-256 체크섬을 답장으로 보내 드립니다. 브라우저로 내려받은 .exe는 SmartScreen 경고가 나올 수 있습니다.</p>`,
    },
  ],
  { open: false },
)}
</div>
<div class="panel-foot"><p>삭제 방법까지 포함한 단계별 안내가 필요하신가요?</p><a class="btn btn-secondary btn-sm" href="/ko/guide/install-windows/">Windows 전체 가이드 ${icon("arrow-right")}</a></div>
`;

export default {
  id: "download",
  lang: "ko",
  path: "/ko/download/",
  title: "macOS·Windows용 다운로드",
  description:
    "macOS 14.2 이상(Apple 실리콘)이나 Windows 10/11에 명령 한 줄로 AI Translator를 설치하세요. 바로 열리고 '확인 없이 열기'가 필요 없습니다. 10일 무료 체험.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: f.a })))],
  body: () => `
${pageHero({
  crumbs,
  title: "macOS와 Windows용 AI Translator 받기",
  lead: "운영체제를 고르고 터미널이나 PowerShell에 명령 한 줄을 붙여 넣으세요. 앱을 내려받아 확인하고 바로 엽니다. 10일 무료 체험, 카드가 필요 없습니다.",
  meta: '<span id="os-detect" class="os-detect" hidden></span>',
})}

<section class="section-tight" id="install"><div class="container dl">
${osTabs({
  labels: {
    list: "운영체제 선택",
    mine: "내 컴퓨터",
    detected: "{os}를 쓰고 계신 것 같습니다",
    mobile: "휴대폰이나 태블릿으로 보고 계십니다. AI Translator는 macOS나 Windows 컴퓨터에서 실행됩니다. 컴퓨터에서 이 페이지를 여세요.",
    other: "AI Translator는 현재 macOS와 Windows만 지원하며, 이 컴퓨터의 운영체제는 지원하지 않습니다. 아래 두 가이드는 읽어 볼 수 있습니다.",
    copyLink: "페이지 링크 복사",
    copied: "복사됨",
  },
  tabs: [
    { key: "macos", id: "install-macos", icon: "command", title: "macOS", sub: "Apple 실리콘 · 14.2+", body: macPanel() },
    { key: "windows", id: "install-windows", icon: "windows", title: "Windows", sub: "10 / 11 · 64비트", body: winPanel() },
  ],
})}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "한눈에 보기", title: "무료 체험과 요금", center: true })}
<div class="reveal">${facts([
  ["현재 버전", RELEASE.ko],
  ["상태", "출시됨. macOS와 Windows 모두 명령 한 줄로 설치"],
  ["무료 체험", "10일, 하루 30분<small>카드도 계정도 필요 없음</small>"],
  ["체험 후 요금", "Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>VietQR(VND) 또는 해외 카드(USD)로 선불, 자동 갱신 없음. Creem 목록에 있는 일부 국가에서는 카드를 사용할 수 없습니다.</small>"],
  ["모델", "한 번만 내려받기, 1.3GB 또는 2.5GB<small>그 후에는 인식과 번역이 내 컴퓨터에서 오프라인으로 실행</small>"],
])}</div>
${callout({ kind: "ok", title: "설치 파일은 저희에게서만 받으세요", text: "AI Translator는 이 페이지의 명령, <strong>support@aitranslator.vn</strong>에서 보낸 링크, 또는 웹사이트 <strong>aitranslator.vn</strong>에서만 설치하세요. 다른 곳에서 받은 설치 파일은 가짜일 수 있습니다." })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "시스템 요구 사항", title: "내 컴퓨터에서 실행될까요?", center: true })}
<div class="table-wrap reveal" role="region" aria-label="시스템 요구 사항" tabindex="0"><table>
<thead><tr><th scope="col"><span class="sr-only">항목</span></th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">운영체제</th><td>macOS 14.2 이상</td><td>Windows 10 또는 11, 64비트(x64)</td></tr>
<tr><th scope="row">프로세서</th><td>Apple 실리콘(M1 이상). Intel Mac용 버전은 없습니다</td><td>AVX2 지원 CPU. Windows ARM64는 아직 지원하지 않습니다</td></tr>
<tr><th scope="row">RAM</th><td>최소 8GB, 16GB 권장</td><td>최소 8GB, 16GB 권장</td></tr>
<tr><th scope="row">그래픽</th><td>Apple GPU</td><td>Standard 팩에는 VRAM 6GB 이상의 외장 그래픽 카드 권장. 없으면 CPU로 실행</td></tr>
<tr><th scope="row">디스크 공간</th><td>1.3GB(Lite 팩) 또는 2.5GB(Standard 팩), 내려받는 동안 1GB 추가 여유 공간</td><td>동일</td></tr>
<tr><th scope="row">설치 파일</th><td>약 9MB의 .dmg 파일(설치 명령이 대신 내려받음)</td><td>약 22MB의 .exe 파일, 관리자 권한 없이 내 계정에만 설치</td></tr>
<tr><th scope="row">코드 서명</th><td>애드혹 서명, 공증 없음: 명령으로 설치하면 바로 열림. 브라우저로 내려받은 .dmg는 처음 실행할 때 '확인 없이 열기' 필요</td><td>코드 서명 없음: 명령으로 설치하면 SmartScreen이 묻지 않음. 브라우저로 내려받은 .exe는 경고가 나올 수 있으며 차단 모드의 스마트 앱 컨트롤은 이를 차단</td></tr>
<tr><th scope="row">권한</th><td>시스템 오디오 녹음(마이크는 쓰지 않음)</td><td>녹음 권한 필요 없음</td></tr>
</tbody></table></div>
<p class="small muted">RAM이 8GB 미만이거나 프로세서가 AVX2를 지원하지 않으면 앱이 이유를 설명하고 모델을 내려받지 못하게 합니다. Intel Mac용 버전은 없습니다.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "자주 묻는 질문", title: "설치에 관하여" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "다음 회의에서 써 보시겠어요?", text: "Mac에서도 Windows에서도 명령 한 줄. 10일 무료 체험, 카드가 필요 없습니다.", primary: { href: "#install", label: "운영체제를 고르고 설치하기" }, secondary: { href: "/ko/guide/quick-start/", label: "빠른 시작 가이드 읽기" } })}
`,
};
void feature;
void steps;
