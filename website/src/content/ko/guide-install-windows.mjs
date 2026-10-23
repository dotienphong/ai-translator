import { pageHero, callout, facts, docLayout, docNav, cmdBlock } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "가이드", path: "/ko/guide/" },
  { name: "Windows에 설치", path: "/ko/guide/install-windows/" },
];

const toc = [
  { level: 2, id: "requirements", text: "내 PC에서 실행되나요?" },
  { level: 2, id: "install-command", text: "빠른 방법: 명령 하나로 설치" },
  { level: 2, id: "install-exe", text: "다른 방법: .exe 파일로 설치" },
  { level: 3, id: "verify-the-file", text: "설치 파일 확인(SHA-256)" },
  { level: 3, id: "run-the-installer", text: "설치 프로그램 실행과 SmartScreen 통과" },
  { level: 2, id: "smart-app-control", text: "Windows 11에서 앱이 차단됨(스마트 앱 컨트롤)" },
  { level: 2, id: "first-launch", text: "첫 실행" },
  { level: 2, id: "updates", text: "업데이트" },
  { level: 2, id: "uninstall", text: "제대로 제거하기" },
  { level: 2, id: "common-problems", text: "설치할 때 흔한 문제" },
];

const INSTALL_CMD = "irm https://aitranslator.vn/install.ps1 | iex";

const HOWTO_STEPS = [
  { name: "PowerShell 열기", text: "Windows 키를 누르고 PowerShell을 입력한 뒤 Enter를 누릅니다. 관리자 권한으로 실행할 필요는 없습니다." },
  { name: "설치 명령을 붙여 넣고 Enter 누르기", text: "irm https://aitranslator.vn/install.ps1 | iex를 PowerShell에 붙여 넣고 Enter를 누릅니다." },
  { name: "앱이 열릴 때까지 기다리기", text: "명령이 최신 버전을 내려받고, SHA-256을 확인하고, 내 계정에만 설치 프로그램을 화면 표시 없이 실행한 뒤 AI Translator를 엽니다." },
];

export default {
  id: "guide-install-windows",
  lang: "ko",
  path: "/ko/guide/install-windows/",
  title: "Windows에 AI Translator 설치하기",
  description:
    "PowerShell 명령 하나로 앱을 내려받고 확인해 내 계정에만 설치하며, SmartScreen 화면이 나오지 않습니다. .exe로 설치, 업데이트, 제거도 다룹니다.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "명령 하나로 Windows에 AI Translator를 설치하고 열기",
      description: "PowerShell에 명령 하나를 붙여 넣으면 AI Translator가 다운로드, 확인되어 내 계정에만 설치된 뒤 열립니다.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Windows에 AI Translator 설치하기",
  lead: "Windows에 AI Translator를 설치하는 가장 빠른 방법은 PowerShell에 명령 하나를 붙여 넣는 것입니다. 설치 프로그램이 다운로드되고 확인된 뒤 내 계정에만 실행되며(관리자 권한 불필요), SmartScreen 화면을 거치지 않고 앱이 열립니다. 이미 브라우저로 .exe를 내려받았다면 두 번 클릭해 설치할 수도 있지만, Windows 버전은 코드 서명되지 않아 SmartScreen이 경고할 수 있습니다. ‘추가 정보’를 누른 뒤 ‘실행’을 누르세요.",
  meta: "<span>Windows 10·11, 64비트(x64)용</span> <span>업데이트 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "이 가이드의 내용",
  body: `
<h2 id="requirements">내 PC에서 실행되나요?</h2>
${facts([
  ["운영체제", "Windows 10 또는 11, 64비트(x64)<small>Windows ARM64는 아직 지원하지 않습니다.</small>"],
  ["프로세서", "AVX2를 지원하는 CPU<small>AVX2가 없으면 앱이 이유를 설명하고 모델을 내려받지 않습니다.</small>"],
  ["메모리", "최소 8GB, 16GB 권장<small>8GB 미만이면 앱이 이유를 설명하고 모델을 내려받지 않습니다.</small>"],
  ["그래픽", "Standard 팩에는 VRAM 6GB 이상의 외장 그래픽 카드 권장<small>없으면 CPU에서 실행됩니다.</small>"],
  ["설치 파일", "약 22MB의 .exe 파일 하나<small>내 Windows 계정에만 설치되며 관리자 권한이 필요 없습니다.</small>"],
  ["모델용 디스크 공간", "1.3GB(Lite 팩) 또는 2.5GB(Standard 팩)<small>내려받는 동안에는 1GB의 여유 공간이 더 필요합니다.</small>"],
  ["인터넷", "모델 다운로드와 Free 체험 등록에 필요<small>설치 중에도 필요할 수 있습니다(아래 참고). 그 뒤로 번역은 오프라인으로 실행됩니다.</small>"],
])}
<p class="small muted">Windows 11에서 시스템 오디오 캡처와 자막 바를 시험했고, 내장 그래픽 노트북 한 대에서 지연 예비 테스트를 했습니다(Mac M4 Pro보다 느렸습니다). 그래서 Windows에서의 지연은 약속하지 않습니다. 성능 좋은 외장 그래픽 카드가 없는 PC에서는 Lite 팩을 쓰세요.</p>

<h2 id="install-command">빠른 방법: 명령 하나로 설치</h2>
<ol>
<li><strong>PowerShell</strong>을 엽니다: <kbd>Windows</kbd> 키를 누르고 <strong>PowerShell</strong>을 입력한 뒤 Enter를 누릅니다. 관리자 권한으로 실행할 필요는 없습니다.</li>
<li>아래 명령을 붙여 넣고 Enter를 누릅니다.</li>
</ol>
${cmdBlock({ cmd: INSTALL_CMD, copy: "명령 복사", copied: "복사됨", label: "Windows에 AI Translator를 설치하는 명령", term: "Windows PowerShell", prompt: "PS>" })}
<ol start="3">
<li>1분 정도 기다립니다. 명령이 최신 버전을 내려받고, SHA-256을 대조하고, 설치 프로그램을 화면 표시 없이 실행한 뒤(<code>%LOCALAPPDATA%\\AI Translator\\</code>에 설치, UAC 확인 없음) 앱을 엽니다.</li>
<li>이어서 <a href="/ko/guide/quick-start/">빠른 시작 가이드</a>를 따르세요.</li>
</ol>
<p><strong>왜 SmartScreen 화면이 나오지 않나요?</strong> SmartScreen은 ‘인터넷에서 다운로드함’ 표시(브라우저가 붙임)가 있는 파일을 파일 탐색기에서 열 때만 검사합니다. PowerShell로 내려받은 파일에는 이 표시가 없고 설치 프로그램도 PowerShell에서 실행되므로, 이 빌드가 코드 서명되지 않았어도 경고가 나오지 않습니다.</p>
${callout({ kind: "warn", title: "이 명령이 무엇을 하는지 알아 두세요.", text: "이 명령은 <strong>aitranslator.vn</strong>에서 스크립트를 내려받고, 스크립트는 <strong>releases.aitranslator.vn</strong>에서 설치 프로그램을 내려받아 SHA-256을 대조한 뒤 설치합니다. 관리자 권한이 필요 없고 데이터도 보내지 않습니다. SHA-256은 파일과 같은 곳에서 제공되므로 주로 손상된 다운로드를 막아 줍니다. 여전히 <strong>aitranslator.vn</strong>을 신뢰하는 것입니다. 스크립트를 먼저 읽으려면, 보여 준 다음에 실행하는 명령을 쓰세요: <code>$s = irm https://aitranslator.vn/install.ps1; $s | more; iex $s</code>. 같은 명령을 언제든 다시 실행하면 업데이트되며, 설치 프로그램이 실행 중인 앱을 스스로 닫습니다." })}
<p>문제가 생겼나요? 스크립트가 멈추고 이유를 알려 줍니다(지원하지 않는 PC, 네트워크 없음, SHA-256 불일치 등). <a href="#common-problems">설치할 때 흔한 문제</a>를 참고하세요.</p>

<h2 id="install-exe">다른 방법: .exe 파일로 설치</h2>
<p>.exe를 이메일로 받았거나 PowerShell을 쓰고 싶지 않다면 이 방법을 쓰세요. 브라우저로 내려받은 파일에는 ‘인터넷에서 다운로드함’ 표시가 붙으므로 SmartScreen이 경고할 수 있습니다.</p>

<h3 id="verify-the-file">설치 파일 확인(SHA-256)</h3>
${callout({ kind: "warn", title: "설치 파일은 공식 출처에서만 내려받으세요.", text: "진짜 .exe는 저희가 <strong>support@aitranslator.vn</strong>에서 보내 드리는 것이나 <strong>aitranslator.vn</strong>에 링크된 것입니다. 다른 곳에서 받은 파일은 가짜이거나 변조되었을 수 있습니다. 이름이 AI Translator라도 실행하지 마세요." })}
<p>이메일로 보내 드리는 설치 파일에는 모두 SHA-256 체크섬이 함께 있습니다. Windows 버전은 코드 서명되지 않았으므로, 이를 대조하는 것이 파일이 바뀌지 않았음을 확인하는 방법입니다. 설치하기 전에 하세요:</p>
<ol>
<li><strong>PowerShell</strong>을 엽니다: 시작을 누르고 <code>PowerShell</code>을 입력한 뒤 <strong>Windows PowerShell</strong>을 엽니다.</li>
<li>아래 명령을 입력하고 <code>&lt;file-name&gt;</code>을 내려받은 파일의 이름으로 바꾼 다음 Enter를 누릅니다. 파일 이름에 공백이 있으므로, 예처럼 경로 전체를 큰따옴표로 감싸세요.</li>
</ol>
<div class="table-wrap"><pre><code>Get-FileHash -Algorithm SHA256 "$env:USERPROFILE\\Downloads\\&lt;file-name&gt;.exe"</code></pre></div>
<ol start="3">
<li><strong>Hash</strong> 열의 64자 문자열을 저희가 보내 드린 것과 비교합니다. PowerShell은 대문자로 보여 주며, 대소문자는 상관없지만 모든 글자가 같아야 합니다.</li>
<li>다르다면 파일을 실행하지 마세요. 다시 내려받고, 그래도 다르면 <a href="/ko/contact/">지원팀에 문의</a>하세요.</li>
</ol>

<h3 id="run-the-installer">설치 프로그램을 실행하고 SmartScreen 경고 통과하기</h3>
<p>설치 프로그램은 <code>AI Translator_&lt;version&gt;_x64-setup.exe</code> 같은 이름의 파일입니다. AI Translator를 내 Windows 계정에만 <code>%LOCALAPPDATA%\\AI Translator\\</code>에 설치하므로 관리자 권한이 필요 없고 관리자(UAC) 확인도 나타나지 않습니다. 설치 프로그램은 Windows 언어에 따라 베트남어나 영어로 표시됩니다.</p>
<p><strong>내려받는 동안 브라우저가 경고한다면.</strong> 브라우저가 이 파일은 자주 다운로드되지 않는다고 알릴 수 있습니다. Microsoft Edge에서는 다운로드 목록의 파일 옆 ‘…’ › <strong>유지</strong> › <strong>자세히 표시</strong> › <strong>그래도 계속</strong>을 누릅니다. Chrome에서는 <strong>유지</strong>를 누릅니다. 공식 출처에서 받은 파일에만 이렇게 하세요.</p>
<ol>
<li>내려받은 <code>.exe</code> 파일(보통 다운로드 폴더에 있음)을 두 번 클릭합니다.</li>
<li>Windows가 파란색 <strong>‘Windows의 PC 보호’</strong> 화면(Microsoft Defender SmartScreen)을 보여 주면 <strong>추가 정보</strong>를 누릅니다.</li>
<li><strong>앱</strong> 줄을 확인합니다: 방금 SHA-256을 확인한 설치 파일이어야 합니다. <strong>게시자</strong>에는 <strong>알 수 없는 게시자</strong>가 표시되는데, 코드 서명되지 않은 빌드에서는 정상입니다.</li>
<li><strong>실행</strong>을 누릅니다.</li>
<li>설치 프로그램을 끝까지 따라갑니다. 앱에 필요한 Windows 표시 구성 요소가 PC에 없으면 설치 프로그램이 이를 내려받으므로, 이때 인터넷 연결이 필요합니다(Windows 11에는 보통 이미 있습니다).</li>
</ol>
<p>파란 화면이 나타나지 않으면 평소처럼 설치하면 됩니다. Windows를 다른 언어로 설정했다면 버튼 이름이 다를 수 있습니다.</p>
${callout({ kind: "warn", title: "Windows는 왜 경고하나요?", text: "SmartScreen은 코드 서명되지 않았거나 아직 다운로드가 많지 않은 파일에 대해 경고합니다. 현재 Windows 버전은 아직 Windows 코드 서명 인증서가 없어 코드 서명되지 않았습니다(macOS 버전에 아직 Apple Developer ID가 없는 것과 같습니다). 파일이 저희에게서 왔고 SHA-256이 일치한다면, 이 빌드에서는 이것이 정상적인 과정입니다. 인증서를 받으면 경고는 차차 줄어들지만, SmartScreen이 새 파일의 평판을 쌓는 데 시간이 걸리므로 바로 사라진다고 약속하지는 않습니다." })}

<h2 id="smart-app-control">Windows 11이 앱을 차단했다고 하고 넘어갈 방법이 없을 때</h2>
<p>이것은 SmartScreen과 다른 <strong>스마트 앱 컨트롤</strong>입니다. 차단 모드에서는 어떤 방법으로 설치했든(명령이든, 브라우저로 내려받은 .exe든) 서명도 평판도 없는 앱의 실행을 허용하지 않으며, <strong>실행</strong> 버튼도 없습니다. 내 Windows 11 PC에서 이 기능이 켜져 있을 수 있습니다(평가 모드에서는 아무것도 차단하지 않고, 차단 모드에서만 차단합니다).</p>
<ol>
<li><strong>Windows 보안 › 앱 및 브라우저 컨트롤 › 스마트 앱 컨트롤 설정</strong>을 엽니다.</li>
<li><strong>끄기</strong>를 고릅니다.</li>
<li>설치 명령이나 설치 프로그램을 다시 실행합니다.</li>
</ol>
<p>이전 버전의 Windows 11에서는 스마트 앱 컨트롤을 한 번 끄면 Windows를 다시 설치하지 않는 한 다시 켤 수 없습니다. 끄고 싶지 않다면 저희가 Windows 코드 서명 인증서를 받을 때까지 기다려 주세요. 회사나 학교가 관리하는 PC에서는 끄지 못할 수 있으니 관리자에게 문의하세요.</p>

<h2 id="first-launch">첫 실행</h2>
<ol>
<li>시작 메뉴에서 <strong>AI Translator</strong>를 엽니다.</li>
<li>앱이 초기 설정을 보여 줍니다. Windows에는 오디오 권한 단계가 없습니다: 앱은 별도 권한 없이 PC에서 재생되는 소리를 캡처하며, 마이크는 쓰지 않습니다.</li>
<li>이어서 <a href="/ko/guide/quick-start/">빠른 시작 가이드</a>를 따르세요.</li>
</ol>
<p>AI Translator는 시스템 트레이에 머뭅니다. 창을 닫으면 앱이 숨겨질 뿐이며, 완전히 종료하려면 트레이 아이콘에서 <strong>종료</strong>를 고릅니다. Windows는 새 아이콘을 작업 표시줄의 <strong>^</strong> 화살표 뒤에 숨길 수 있습니다. 아이콘을 작업 표시줄로 끌어 놓거나 작업 표시줄 설정에서 켜세요. Windows의 단축키는 Ctrl+Alt를 씁니다(<a href="/ko/guide/subtitle-bar-and-shortcuts/">자막 바와 단축키</a> 참고).</p>

<h2 id="updates">업데이트</h2>
<p>앱은 열린 지 1분쯤 뒤에 새 버전을 확인하고, 그 뒤로는 24시간마다 확인하며 백그라운드에서 내려받습니다. 준비되면 앱이 ‘다시 시작’ 또는 ‘나중에’를 묻고(트레이 메뉴에도 ‘다시 시작하여 업데이트’가 있음), 다시 시작하거나 ‘종료’를 고를 때 새 버전이 설치됩니다. 업데이트 채널(안정 버전 또는 Beta)은 ‘설정 › 일반’에서 고르며, 바꾸면 바로 확인합니다. 바로 확인하려면 ‘설정 › 일반’에서 <strong>업데이트 확인</strong>을 누르거나 앱 아이콘 메뉴에서 ‘업데이트 확인…’을 고릅니다. 같은 설치 명령을 언제든 실행해 최신 버전을 받을 수도 있습니다. 저희가 이메일로 보내 드린 .exe로 설치했는데 그 빌드가 스스로 업데이트되지 않는다면, 새 파일을 SHA-256과 함께 보내 드립니다. 새 파일에도 SmartScreen이 다시 경고할 수 있습니다.</p>

<h2 id="uninstall">제대로 제거하기</h2>
<ol>
<li>AI Translator를 열고 <strong>설정 › 개인정보 보호</strong>로 갑니다.</li>
<li><strong>모델 및 데이터 삭제</strong>를 누르고 <strong>모두 삭제</strong>로 확인합니다. 앱이 내려받은 모든 모델(1.3GB 또는 2.5GB), 기록, 용어집을 지웁니다.</li>
<li>시스템 트레이의 AI Translator 아이콘에서 <strong>종료</strong>를 고릅니다.</li>
<li><strong>설정 › 앱 › 설치된 앱</strong>을 열고 <strong>AI Translator</strong>를 찾아 <strong>제거</strong>를 누릅니다.</li>
</ol>
<p>제거 프로그램에는 앱 데이터를 지우는 옵션이 있으며, 체크하면 1~2단계를 건너뛰었더라도 모델이 지워집니다. 라이선스와 남은 번역 시간은 유지되므로, 다시 설치해도 구매한 요금제를 잃지 않을 것입니다. Free 체험은 PC에 묶여 있어 다시 설치해도 10일이 다시 시작되지 않습니다. 모델, 기록, 용어집, 로그는 <code>%LOCALAPPDATA%\\com.aitranslator.desktop\\</code>에 있고(모델은 <code>models</code> 하위 폴더, 로그는 <code>logs\\app.log</code>), 설정 파일 <code>settings.json</code>은 <code>%APPDATA%\\com.aitranslator.desktop\\</code>에 있습니다. 키, 토큰, 번역 시간 카운터는 자격 증명 관리자에 보관됩니다.</p>

<h2 id="common-problems">설치할 때 흔한 문제</h2>
<ul>
<li><strong>설치 명령이 https://releases.aitranslator.vn/stable/latest.json을 읽지 못했다고 합니다.</strong> PC가 네트워크에 연결되어 있지 않거나, 프록시/VPN이 <code>releases.aitranslator.vn</code>을 막고 있습니다. 연결을 확인하고 다시 실행하세요.</li>
<li><strong>설치 명령이 SHA-256이 일치하지 않는다고 합니다.</strong> 내려받는 도중 파일이 손상되었거나 변조되었습니다. 스크립트는 아무것도 설치하지 않습니다. 다시 실행하고, 그래도 다르면 <a href="/ko/contact/">지원팀</a>에 메일을 보내 주세요.</li>
<li><strong>설치 명령이 실행되지 않습니다(제한된 언어 모드라고 표시됨).</strong> 회사가 관리하는 PC는 스크립트를 막을 수 있습니다. .exe 방법을 쓰거나 관리자에게 문의하세요.</li>
<li><strong>앱이 차단되고 넘어갈 방법이 없습니다.</strong> 위의 스마트 앱 컨트롤 절을 참고하세요.</li>
<li><strong>SmartScreen에 ‘실행’ 버튼이 없습니다.</strong>(브라우저로 내려받은 .exe로 설치할 때만.) PC의 정책(예: 회사나 학교가 관리하는 컴퓨터)이 코드 서명되지 않은 앱을 막고 있을 수 있습니다. 컴퓨터를 관리하는 사람에게 문의하세요.</li>
<li><strong>백신 프로그램이 설치 프로그램을 막거나 지웁니다.</strong> SHA-256을 다시 확인하세요. 일치하는데도 막힌다면, 쓰는 백신 프로그램 이름을 알려 주시며 <a href="/ko/contact/">지원팀에 문의</a>하세요.</li>
<li><strong>앱에 ‘이 컴퓨터의 프로세서에는 AI Translator에 필요한 AVX2가 없습니다.’라고 표시됩니다.</strong> AVX2가 없으면 앱이 모델을 내려받을 수 없습니다.</li>
<li><strong>앱에 ‘이 컴퓨터는 RAM이 8 GB 미만이어서 AI Translator가 아직 지원하지 않습니다.’라고 표시됩니다.</strong> RAM이 8GB 미만인 PC는 모델을 내려받을 수 없습니다.</li>
<li><strong>Windows ARM64 PC.</strong> 아직 지원하지 않습니다. Windows 빌드는 x64뿐이며, ARM64 기기에서는 시험하지 않았습니다.</li>
<li><strong>앱에 ‘이 AI Translator는 정품이 아니므로 Free만 사용할 수 있습니다.’라고 표시됩니다.</strong> 설치한 파일이 변경되었거나 잘못된 출처에서 왔습니다. 공식 출처에서 다시 내려받으세요.</li>
</ul>
<p>설치한 뒤 자막이 나오지 않으면 <a href="/ko/guide/troubleshooting/">문제 해결</a>을 참고하세요.</p>

${docNav(
  [
    { href: "/ko/guide/quick-start/", kicker: "이전", title: "AI Translator 빠른 시작" },
    { href: "/ko/guide/subtitle-bar-and-shortcuts/", kicker: "다음", title: "자막 바와 단축키" },
    { href: "/ko/guide/troubleshooting/", kicker: "관련", title: "문제 해결" },
  ],
  "관련 가이드",
)}
`,
})}
</div></section>
`,
};
