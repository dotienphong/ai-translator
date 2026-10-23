import { pageHero, callout, facts, docLayout, docNav, cmdBlock } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "가이드", path: "/ko/guide/" },
  { name: "macOS에 설치", path: "/ko/guide/install-macos/" },
];

const toc = [
  { level: 2, id: "requirements", text: "내 Mac에서 실행되나요?" },
  { level: 2, id: "install-command", text: "빠른 방법: 명령 하나로 설치" },
  { level: 2, id: "install-dmg", text: "다른 방법: .dmg 파일로 설치" },
  { level: 3, id: "verify-the-file", text: "설치 파일 확인(SHA-256)" },
  { level: 3, id: "drag-to-applications", text: "응용 프로그램으로 끌기" },
  { level: 3, id: "first-launch", text: "첫 실행: macOS가 차단하는 이유" },
  { level: 2, id: "updates", text: "업데이트할 때마다" },
  { level: 2, id: "uninstall", text: "제대로 제거하기" },
  { level: 2, id: "common-problems", text: "설치할 때 흔한 문제" },
];

const INSTALL_CMD = "curl -fsSL https://aitranslator.vn/install.sh | bash";

const HOWTO_STEPS = [
  { name: "터미널 열기", text: "Command + Space를 누르고 ‘터미널’을 입력한 뒤 Enter를 누릅니다." },
  { name: "설치 명령을 붙여 넣고 Enter 누르기", text: "curl -fsSL https://aitranslator.vn/install.sh | bash를 터미널에 붙여 넣고 Enter를 누릅니다. 암호는 필요 없습니다." },
  { name: "앱이 열릴 때까지 기다리기", text: "명령이 최신 버전을 내려받고, SHA-256을 확인하고, AI Translator를 응용 프로그램에 복사한 뒤 엽니다. macOS가 시스템 오디오 녹음 권한을 요청하면 ‘허용’을 고릅니다." },
];

export default {
  id: "guide-install-macos",
  lang: "ko",
  path: "/ko/guide/install-macos/",
  title: "macOS에 AI Translator 설치하기",
  description:
    "터미널 명령 하나로 앱을 내려받고 확인해 바로 엽니다. ‘그래도 열기’가 필요 없습니다. .dmg로 설치, SHA-256 확인, 업데이트, 제거도 다룹니다.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "명령 하나로 macOS에 AI Translator를 설치하고 열기",
      description: "터미널에 명령 하나를 붙여 넣으면 AI Translator가 다운로드, 확인, 설치되고, ‘그래도 열기’ 단계 없이 바로 열립니다.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "macOS에 AI Translator 설치하기",
  lead: "macOS에 AI Translator를 설치하는 가장 빠른 방법은 터미널에 명령 하나를 붙여 넣는 것입니다. 앱이 다운로드되고 확인된 뒤 바로 열리므로, 시스템 설정에 가서 ‘그래도 열기’를 누를 필요가 없습니다. 이미 브라우저로 .dmg를 내려받았다면 응용 프로그램으로 끌어 설치할 수도 있지만, 현재 빌드는 애드혹 서명이고 Apple의 공증을 받지 않아 macOS가 첫 실행을 차단합니다.",
  meta: "<span>macOS 14.2 이상, Apple 실리콘용</span> <span>업데이트 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "이 가이드의 내용",
  body: `
<h2 id="requirements">내 Mac에서 실행되나요?</h2>
${facts([
  ["칩", "Apple 실리콘(M1 이상)<small>Intel Mac 버전은 없습니다. 칩은 Apple 메뉴 › 이 Mac에 관하여에서 확인할 수 있습니다.</small>"],
  ["운영체제", "macOS 14.2 이상"],
  ["메모리", "최소 8GB, 16GB 권장<small>8GB 미만이면 앱이 이유를 설명하고 모델을 내려받지 않습니다.</small>"],
  ["설치 파일", "약 9MB의 .dmg 파일"],
  ["모델용 디스크 공간", "1.3GB(Lite 팩) 또는 2.5GB(Standard 팩)<small>내려받는 동안에는 1GB의 여유 공간이 더 필요합니다.</small>"],
  ["인터넷", "모델 다운로드와 Free 체험 등록에 필요<small>그 뒤로 번역은 오프라인으로 실행됩니다.</small>"],
])}
<p class="small muted">기본형 M1 Mac에서는 성능을 측정하지 않았으므로 그곳에서의 지연은 약속할 수 없습니다. 8GB Mac에서는 Lite 팩이 알맞은 선택입니다.</p>

<h2 id="install-command">빠른 방법: 명령 하나로 설치</h2>
<ol>
<li><strong>터미널</strong>을 엽니다: <kbd>⌘</kbd> + <kbd>Space</kbd>를 누르고 <strong>터미널</strong>을 입력한 뒤 Enter를 누릅니다.</li>
<li>아래 명령을 붙여 넣고 Enter를 누릅니다. 암호는 필요 없습니다.</li>
</ol>
${cmdBlock({ cmd: INSTALL_CMD, copy: "명령 복사", copied: "복사됨", label: "macOS에 AI Translator를 설치하는 명령" })}
<ol start="3">
<li>1분 정도 기다립니다. 명령이 최신 AI Translator를 내려받고, SHA-256을 대조하고, 앱의 서명을 확인한 뒤, 앱을 <code>/Applications</code>(쓸 수 없으면 <code>~/Applications</code>)에 복사하고 엽니다.</li>
<li>macOS가 <strong>시스템 오디오 녹음</strong> 권한을 요청하면 ‘허용’을 고릅니다. 이어서 <a href="/ko/guide/quick-start/">빠른 시작 가이드</a>를 따르세요.</li>
</ol>
<p><strong>왜 ‘그래도 열기’ 단계가 없나요?</strong> macOS는 ‘인터넷에서 다운로드함’ 표시(브라우저가 붙임)가 있는 파일의 앱만 차단합니다. 터미널의 <code>curl</code>로 내려받은 파일에는 이 표시가 없으므로, Apple이 공증하지 않았어도 앱이 바로 열립니다.</p>
${callout({ kind: "warn", title: "이 명령이 무엇을 하는지 알아 두세요.", text: "이 명령은 <strong>aitranslator.vn</strong>에서 스크립트를 내려받고, 스크립트는 <strong>releases.aitranslator.vn</strong>에서 설치 파일을 내려받아 SHA-256을 대조한 뒤 설치합니다. sudo를 쓰지 않고 데이터도 보내지 않습니다. SHA-256은 파일과 같은 곳에서 제공되므로 주로 손상된 다운로드를 막아 줍니다. 여전히 <strong>aitranslator.vn</strong>을 신뢰하는 것입니다. 스크립트를 먼저 읽으려면: <code>curl -fsSL https://aitranslator.vn/install.sh -o install.sh && less install.sh && bash install.sh</code>. 같은 명령을 언제든 다시 실행하면 최신 버전으로 업데이트되며, 스크립트가 실행 중인 앱을 스스로 종료합니다." })}
<p>문제가 생겼나요? 스크립트가 멈추고 이유를 알려 줍니다(지원하지 않는 Mac, 네트워크 없음, SHA-256 불일치 등). <a href="#common-problems">설치할 때 흔한 문제</a>를 참고하세요.</p>

<h2 id="install-dmg">다른 방법: .dmg 파일로 설치</h2>
<p>.dmg를 이메일로 받았거나 터미널을 쓰고 싶지 않다면 이 방법을 쓰세요. 브라우저로 내려받은 파일에는 macOS가 ‘인터넷에서 다운로드함’ 표시를 붙이므로, 첫 실행에 ‘그래도 열기’ 단계가 추가로 필요합니다.</p>

<h3 id="verify-the-file">설치 파일 확인(SHA-256)</h3>
${callout({ kind: "warn", title: "설치 파일은 공식 출처에서만 내려받으세요.", text: "진짜 .dmg는 저희가 <strong>support@aitranslator.vn</strong>에서 보내 드리는 것이나 <strong>aitranslator.vn</strong>에 링크된 것입니다. 다른 곳에서 받은 파일은 가짜이거나 변조되었을 수 있습니다. 이름이 AI Translator라도 열지 마세요." })}
<p>이메일로 보내 드리는 설치 파일에는 모두 SHA-256 체크섬이 함께 있습니다. 설치하기 전에 대조하세요:</p>
<ol>
<li><strong>터미널</strong>을 엽니다(응용 프로그램 › 유틸리티).</li>
<li><code>shasum -a 256</code>을 입력하고 공백을 하나 넣은 뒤, Finder에서 .dmg 파일을 터미널 창으로 끌어 경로를 채우고(파일 이름의 공백도 포함됨) Enter를 누릅니다. 또는 아래 명령을 입력합니다. 파일 이름에 공백이 있으면 예처럼 큰따옴표로 감싸세요.</li>
</ol>
<div class="table-wrap"><pre><code>shasum -a 256 ~/Downloads/"&lt;file-name&gt;.dmg"</code></pre></div>
<ol start="3">
<li>출력된 64자 문자열을 저희가 보내 드린 것과 비교합니다. 완전히 같아야 합니다.</li>
<li>다르다면 파일을 열지 마세요. 다시 내려받고, 그래도 다르면 <a href="/ko/contact/">지원팀에 문의</a>하세요.</li>
</ol>

<h3 id="drag-to-applications">AI Translator를 응용 프로그램으로 끌기</h3>
<ol>
<li><code>.dmg</code> 파일을 두 번 클릭해 엽니다.</li>
<li>나타난 창에서 <strong>AI Translator</strong>를 <strong>응용 프로그램</strong> 폴더로 끌어 놓습니다.</li>
</ol>

<h3 id="first-launch">첫 실행: macOS가 차단하는 이유와 허용 방법</h3>
<p>macOS는 Gatekeeper로 인터넷에서 내려받은 앱을 검사합니다. 현재 AI Translator 빌드는 애드혹 서명이며, 아직 Apple Developer ID가 없어 Apple의 공증을 받지 않았습니다. 그래서 macOS가 첫 실행을 차단하고 개발자를 확인할 수 없다고 알립니다. 파일이 저희에게서 왔고 SHA-256이 일치한다면, 이 빌드에서는 이것이 정상적인 과정입니다.</p>
<ol>
<li>응용 프로그램에서 AI Translator를 엽니다. macOS가 개발자를 확인할 수 없다고 하면 <strong>완료</strong>를 누릅니다(대화상자를 닫는 버튼이며, macOS 버전에 따라 이름이 조금 다를 수 있습니다).</li>
<li><strong>시스템 설정 › 개인정보 보호 및 보안</strong>을 엽니다.</li>
<li>페이지 맨 아래로 스크롤해 AI Translator 옆의 <strong>그래도 열기</strong>를 누릅니다.</li>
<li>로그인 암호나 Touch ID로 확인합니다.</li>
<li>앱이 열리고 초기 설정이 나타납니다. 이어서 <a href="/ko/guide/quick-start/">빠른 시작 가이드</a>를 따르세요.</li>
</ol>
${callout({ kind: "warn", title: "macOS 15부터는 오른쪽 클릭 › 열기 방법이 통하지 않습니다.", text: "위처럼 ‘개인정보 보호 및 보안’을 거치세요. ‘그래도 열기’ 버튼은 보통 macOS가 앱을 여는 시도를 한 번 차단한 뒤에만 나타납니다. 보이지 않으면 앱을 한 번 더 연 다음 돌아오세요." })}
<p>이 단계는 브라우저로 내려받은 .dmg에만 해당하며, <a href="#install-command">한 줄 명령</a>으로 설치하면 필요 없습니다. Developer ID를 받아 앱을 공증하면 어떤 방법으로 설치하든 이 단계는 사라집니다.</p>

<h2 id="updates">업데이트할 때마다 macOS가 다시 묻는 것</h2>
<p>먼저 업데이트 방식입니다: 앱은 열린 지 1분쯤 뒤에 새 버전을 확인하고, 그 뒤로는 24시간마다 확인하며 백그라운드에서 내려받습니다. 준비되면 앱이 ‘다시 시작’ 또는 ‘나중에’를 묻고(트레이 메뉴에도 ‘다시 시작하여 업데이트’가 있음), 다시 시작하거나 ‘종료’를 고를 때 새 버전이 설치됩니다. 업데이트 채널(안정 버전 또는 Beta)은 ‘설정 › 일반’에서 고르며, 바꾸면 바로 확인합니다. 바로 확인하려면 ‘설정 › 일반’에서 <strong>업데이트 확인</strong>을 누르거나 앱 아이콘 메뉴에서 ‘업데이트 확인…’을 고릅니다.</p>
<p>나머지는 애드혹 서명의 결과입니다: 새 빌드마다 서명이 달라서 macOS가 키체인 접근을 다시 묻습니다. 0.1.1 버전부터 AI Translator는 모든 민감한 데이터(기록 암호화 키, 라이선스 토큰, 번역 시간 카운터)를 <strong>하나의</strong> 키체인 항목에 보관하므로, 업데이트할 때마다 다음이 나타납니다:</p>
<ul>
<li>Mac 로그인 암호를 묻는 <strong>키체인 대화상자 1개</strong>(macOS 26을 쓰는 Mac 한 대에서 측정: 새 빌드를 흉내 내려고 앱을 두 번 다시 서명했을 때 매번 대화상자는 1개뿐이었습니다): 암호를 입력하고 <strong>항상 허용</strong>을 고릅니다. ‘거부’는 고르지 마세요. 앱이 라이선스와 번역 시간을 읽지 못하게 됩니다. 실수로 골랐다면 앱을 완전히 종료하고 다시 연 뒤 ‘항상 허용’을 고르세요.</li>
<li><strong>시스템 오디오 녹음</strong> 권한을 한 번 더 물을 수 있습니다(이전 측정에서 대화상자 1개를 기록했습니다): 허용하세요.</li>
</ul>
<p><strong>0.1.0에서 0.1.1로의 첫 업데이트만</strong> 다릅니다: 앱이 예전 키체인 항목 5개를 새 항목으로 옮겨야 해서, 키체인 대화상자가 한 번에 5개 나타납니다(정확히 5개와 녹음 허용 대화상자 1개를 측정했습니다). 그 뒤의 업데이트는 1개뿐입니다.</p>
<p>‘항상 허용’을 고르면 이후 실행에서는 다시 묻지 않습니다. 데이터, 요금제, 번역 시간을 잃지 않습니다. 새로 설치할 때는 키체인 대화상자가 측정되지 않았습니다(녹음 권한과, 브라우저로 내려받은 .dmg로 설치한 경우의 ‘그래도 열기’뿐). 그래도 macOS가 묻는다면 ‘항상 허용’을 고르세요. 앱은 업데이트 안내에서 미리 알려 드립니다. Developer ID를 받으면 이 일은 사라집니다. 같은 설치 명령으로 업데이트할 수도 있으며, 같은 이유로 키체인 대화상자가 나타납니다.</p>

<h2 id="uninstall">제대로 제거하기</h2>
<p>macOS는 앱을 지울 때 앱이 정리할 기회를 주지 않으므로, 먼저 모델과 데이터를 지운 다음 앱을 휴지통에 버리세요:</p>
<ol>
<li>AI Translator를 열고 <strong>설정 › 개인정보 보호</strong>로 갑니다.</li>
<li><strong>모델 및 데이터 삭제</strong>를 누르고 <strong>모두 삭제</strong>로 확인합니다. 앱이 내려받은 모든 모델(1.3GB 또는 2.5GB), 기록, 용어집을 지웁니다.</li>
<li>메뉴 막대의 AI Translator 아이콘에서 <strong>종료</strong>를 고릅니다.</li>
<li>응용 프로그램에서 <strong>AI Translator</strong>를 휴지통으로 끌어 놓습니다.</li>
</ol>
<p>라이선스와 남은 번역 시간은 유지되므로, 다시 설치해도 구매한 요금제를 잃지 않을 것입니다. Free 체험은 Mac에 묶여 있어 다시 설치해도 10일이 다시 시작되지 않습니다. 모델을 지우지 않고 앱을 이미 지웠다면, 모델은 <code>~/Library/Application Support/com.aitranslator.desktop/models</code>에 있습니다.</p>

<h2 id="common-problems">설치할 때 흔한 문제</h2>
<ul>
<li><strong>설치 명령이 https://releases.aitranslator.vn/stable/latest.json을 읽지 못했다고 합니다.</strong> Mac이 네트워크에 연결되어 있지 않거나, 프록시/VPN이 <code>releases.aitranslator.vn</code>을 막고 있습니다. 연결을 확인하고 다시 실행하세요.</li>
<li><strong>설치 명령이 SHA-256이 일치하지 않는다고 합니다.</strong> 내려받는 도중 파일이 손상되었거나 변조되었습니다. 스크립트는 아무것도 설치하지 않습니다. 다시 실행하고, 그래도 다르면 <a href="/ko/contact/">지원팀</a>에 메일을 보내 주세요.</li>
<li><strong>설치 명령이 앱이 아직 실행 중이라고 합니다.</strong> AI Translator를 완전히 종료하고(메뉴 막대의 AI Translator 메뉴 › 종료) 명령을 다시 실행하세요.</li>
<li><strong>설치 명령이 Apple 실리콘이나 macOS 14.2가 필요하다고 합니다.</strong> Mac이 요구 사항을 충족하지 않습니다. Intel Mac용 빌드는 없습니다.</li>
<li><strong>‘그래도 열기’ 버튼이 없습니다.</strong>(브라우저로 내려받은 .dmg로 설치할 때만.) macOS가 차단을 기록하도록 앱을 한 번 더 연 다음 ‘개인정보 보호 및 보안’으로 돌아가세요.</li>
<li><strong>Intel Mac에 설치되지 않습니다.</strong> AI Translator는 Apple 실리콘 전용입니다.</li>
<li><strong>앱에 ‘이 컴퓨터는 RAM이 8 GB 미만이어서 AI Translator가 아직 지원하지 않습니다.’라고 표시됩니다.</strong> RAM이 8GB 미만인 Mac은 모델을 내려받을 수 없습니다.</li>
<li><strong>앱에 ‘이 AI Translator는 정품이 아니므로 Free만 사용할 수 있습니다.’라고 표시됩니다.</strong> 설치한 파일이 변경되었거나 잘못된 출처에서 왔습니다. 공식 출처에서 다시 내려받으세요.</li>
<li><strong>업데이트 후 macOS가 키체인에 대해 여러 번 묻습니다.</strong> 애드혹 서명 빌드에서는 정상입니다. 암호를 입력하고 ‘항상 허용’을 고르세요.</li>
</ul>
<p>설치한 뒤 자막이 나오지 않으면 <a href="/ko/guide/macos-audio-permission/">시스템 오디오 녹음 권한을 허용하는 방법</a>을 참고하세요.</p>

${docNav(
  [
    { href: "/ko/guide/quick-start/", kicker: "이전", title: "AI Translator 빠른 시작" },
    { href: "/ko/guide/macos-audio-permission/", kicker: "다음", title: "macOS에서 시스템 오디오 녹음 권한 허용하기" },
    { href: "/ko/guide/troubleshooting/", kicker: "관련", title: "문제 해결" },
  ],
  "관련 가이드",
)}
`,
})}
</div></section>
`,
};
