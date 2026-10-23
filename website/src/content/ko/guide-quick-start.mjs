import { pageHero, callout, appShot, overlayShot, facts, keys, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "가이드", path: "/ko/guide/" },
  { name: "빠른 시작", path: "/ko/guide/quick-start/" },
];

const toc = [
  { level: 2, id: "what-you-need", text: "필요한 것" },
  { level: 2, id: "install-and-open", text: "앱 설치하고 열기" },
  { level: 2, id: "first-time-setup", text: "7단계 초기 설정" },
  { level: 2, id: "first-meeting", text: "첫 회의 번역하기" },
  { level: 2, id: "common-problems", text: "처음 실행할 때 흔한 문제" },
];

// HowTo 구조화 데이터용 일반 텍스트. 화면에 보이는 내용은 body에 있습니다.
const HOWTO_STEPS = [
  { name: "앱을 설치하고 열기", text: "macOS에서는 설치 명령(curl -fsSL https://aitranslator.vn/install.sh | bash)을 터미널에 붙여 넣습니다. 앱이 다운로드되고 확인된 뒤 바로 열리며, ‘그래도 열기’가 필요 없습니다. Windows에서는 설치 명령(irm https://aitranslator.vn/install.ps1 | iex)을 PowerShell에 붙여 넣습니다. 브라우저로 내려받은 .exe를 쓰는데 SmartScreen이 경고하면 ‘추가 정보’를 누른 뒤 ‘실행’을 누릅니다." },
  { name: "인터페이스 언어 고르기", text: "컴퓨터의 언어가 미리 선택되어 있습니다. 필요하면 바꾸고 ‘다음’을 누릅니다. 이것이 기본 번역 언어도 정합니다." },
  { name: "약관에 동의하기", text: "사용권 계약(EULA)과 개인정보 처리방침을 읽고 체크한 뒤 ‘다음’을 누릅니다. Free 체험을 시작하려면 인터넷 연결이 한 번 필요합니다." },
  { name: "모델을 골라 내려받기", text: "앱의 추천에 따라 Standard 팩(약 2.5GB) 또는 Lite 팩(약 1.3GB)을 고르고 다운로드를 기다립니다." },
  { name: "시스템 오디오 녹음 허용하기(macOS만)", text: "macOS가 시스템 오디오 녹음 권한을 요청하면 허용합니다. 앱은 마이크를 쓰지 않습니다. Windows에는 이 단계가 없습니다." },
  { name: "언어 고르기", text: "‘번역 언어’에서 읽고 싶은 언어를 고르고, 회의에서 쓸 수 있는 언어를 고릅니다." },
  { name: "사용해 보기", text: "‘샘플 문장 재생’을 누르고 자막 바에 자막이 나타나는 것을 확인합니다." },
  { name: "안내를 읽고 마치기", text: "개인정보 안내와 메뉴 막대(macOS) 또는 시스템 트레이(Windows)에 대한 안내를 읽은 뒤 ‘AI Translator 시작하기’를 누릅니다." },
  { name: "첫 회의 번역하기", text: "소리가 나는 회의나 동영상을 열고 ‘시작’을 누른 뒤 떠 있는 바의 자막을 읽습니다. 끝나면 ‘중지’를 누르고, 필요하면 대본을 엽니다." },
];

export default {
  id: "guide-quick-start",
  lang: "ko",
  path: "/ko/guide/quick-start/",
  title: "AI Translator 빠른 시작(macOS·Windows)",
  description:
    "macOS와 Windows에서 AI Translator 빠른 시작: 앱 설치, 모델 다운로드, 샘플 문장으로 확인하고 첫 회의를 실시간으로 번역하기.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "AI Translator를 설치하고 첫 회의 번역하기",
      description: "설치 파일부터 첫 번역 자막까지의 단계: 설치, 초기 설정, 번역 시작.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "AI Translator 빠른 시작",
  lead: "AI Translator를 처음 쓸 때는 앱을 설치하고, 한 번만 하는 설정(언어, 약관, 모델 다운로드, macOS의 오디오 권한, 샘플 문장)을 마친 뒤, 회의 소리가 날 때 ‘시작’을 누르면 됩니다. 번역 자막은 떠 있는 바에 나타나며, 음성 인식과 번역 모두 사용자의 컴퓨터에서 실행됩니다.",
  meta: "<span>macOS 14.2 이상(Apple 실리콘)과 Windows 10/11 64비트용</span> <span>업데이트 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "이 가이드의 내용",
  body: `
<h2 id="what-you-need">필요한 것</h2>
${facts([
  ["macOS", "14.2 이상, Apple 실리콘(M1 이상)<small>아직 Intel Mac 버전은 없습니다.</small>"],
  ["Windows", "Windows 10 또는 11, 64비트(x64), AVX2 지원 CPU<small>Windows ARM64는 아직 지원하지 않습니다.</small>"],
  ["메모리", "최소 8GB, 16GB 권장"],
  ["설치 파일", "macOS: 약 9MB의 .dmg 파일 · Windows: 약 22MB의 .exe 파일<small>둘 다 <a href=\"/ko/download/\">다운로드</a> 페이지의 명령 하나로 설치됩니다</small>"],
  ["디스크 공간", "1.3GB(Lite 팩) 또는 2.5GB(Standard 팩)<small>모델을 내려받는 동안에는 1GB의 여유 공간이 더 필요합니다</small>"],
  ["인터넷", "모델 다운로드와 Free 체험 등록에 필요<small>그 뒤로 인식과 번역은 오프라인으로 실행됩니다</small>"],
])}
${callout({ title: "Windows를 쓰시나요?", text: "아래 단계는 Windows에서도 거의 같지만 몇 가지 차이가 있습니다: PowerShell 명령으로 설치합니다(.exe 파일도 쓸 수 있지만, Windows 버전은 아직 코드 서명되지 않아 SmartScreen 경고가 뜰 수 있습니다). 오디오 권한 단계가 없고, 앱은 메뉴 막대가 아니라 시스템 트레이에 있으며, 단축키는 ⌃⌥ 대신 Ctrl+Alt를 씁니다." })}

<h2 id="install-and-open">앱 설치하고 열기</h2>
<p><strong>macOS에서:</strong></p>
<ol>
<li><strong>터미널</strong>을 엽니다(<kbd>⌘</kbd> + <kbd>Space</kbd>를 누르고 ‘터미널’을 입력한 뒤 Enter).</li>
<li><a href="/ko/download/#install-macos">다운로드</a> 페이지의 설치 명령을 붙여 넣고 Enter를 누릅니다: <code>curl -fsSL https://aitranslator.vn/install.sh | bash</code>.</li>
<li>1분 정도 기다립니다. 앱이 다운로드되고, 확인되고, 응용 프로그램 폴더에 복사된 뒤 바로 열립니다. macOS가 시스템 오디오 녹음 권한을 요청하면 ‘허용’을 고릅니다.</li>
</ol>
<p>이미 브라우저로 <code>.dmg</code>를 내려받았다면: <strong>AI Translator</strong>를 <strong>응용 프로그램</strong>으로 끌어 놓고 엽니다(현재 빌드는 애드혹 서명이고 아직 Apple의 공증을 받지 않아 macOS가 첫 실행을 차단합니다). <strong>완료</strong>를 누르고, <strong>시스템 설정 › 개인정보 보호 및 보안</strong>으로 가서 맨 아래로 스크롤한 뒤 <strong>그래도 열기</strong>를 누르고 암호나 Touch ID로 확인합니다.</p>
<p><strong>Windows에서:</strong></p>
<ol>
<li><strong>PowerShell</strong>을 엽니다(<kbd>Windows</kbd> 키를 누르고 PowerShell을 입력한 뒤 Enter).</li>
<li><a href="/ko/download/#install-windows">다운로드</a> 페이지의 설치 명령을 붙여 넣고 Enter를 누릅니다: <code>irm https://aitranslator.vn/install.ps1 | iex</code>. 관리자 권한은 필요 없습니다.</li>
<li>1분 정도 기다립니다. 설치 프로그램이 화면 표시 없이 실행되고 AI Translator가 저절로 열립니다.</li>
</ol>
<p>이미 브라우저로 <code>.exe</code>를 내려받았다면: 두 번 클릭합니다. Windows가 파란색 ‘Windows의 PC 보호’ 화면을 보여 주면 <strong>추가 정보</strong>를 누르고, ‘앱’ 줄에 설치 프로그램의 파일 이름이 보이는지 확인한 뒤 <strong>실행</strong>을 누릅니다.</p>
<p>설치 파일의 SHA-256을 확인하는 방법 등 자세한 내용은 <a href="/ko/guide/install-macos/">macOS</a>와 <a href="/ko/guide/install-windows/">Windows</a> 설치 가이드를 참고하세요.</p>

<h2 id="first-time-setup">7단계 초기 설정</h2>
<p>처음 실행하면 앱은 창 가운데의 카드에 9개 화면으로 된 설정 마법사를 보여 줍니다. 위에는 로고, ‘9단계 중 1단계’, 진행률 막대가 있고, 아래에는 <strong>이전</strong>과 <strong>다음</strong>이 있습니다. 이 가이드는 이를 7단계로 묶었습니다. Windows에는 오디오 권한 화면이 없어 마법사가 8개 화면이며, 아래 스크린숏의 단계 번호는 macOS 기준입니다.</p>

<h3>1단계. 인터페이스 언어 고르기</h3>
<p>컴퓨터의 언어가 미리 선택되어 있습니다: <strong>Tiếng Việt</strong>, <strong>English</strong>, <strong>日本語</strong>, <strong>中文</strong>(중국어 간체), <strong>한국어</strong>. 컴퓨터가 그 밖의 언어를 쓰면 English가 선택됩니다. 필요하면 바꾸고 ‘다음’을 누릅니다. 이것은 자막을 읽을 언어도 정하며, 5단계에서 다시 바꿀 수 있습니다.</p>
${appShot({ slug: "app-onboarding-1", lang: "ko", alt: "설정 마법사의 첫 화면. Tiếng Việt, English, 日本語, 中文, 한국어 다섯 가지 인터페이스 언어 선택지", caption: "9단계 중 1단계: 인터페이스 언어." })}

<h3>2단계. 약관에 동의하기</h3>
<p>사용권 계약(EULA)과 개인정보 처리방침을 읽고 ‘사용권 계약(EULA)과 개인정보 처리방침을 읽었으며 이에 동의합니다.’에 체크합니다. 체크하기 전에는 ‘다음’을 누를 수 없습니다. 두 문서 모두 베트남어판과 영어판이 있으며, 인터페이스가 일본어, 중국어, 한국어라면 앱은 짧은 안내와 함께 영어판을 보여 줍니다. 같은 화면에는 앱에 오류가 생겼을 때 오류 보고서를 자동으로 보내는 선택 체크박스가 있으며 기본으로 체크되어 있습니다(오디오와 받아쓰기 텍스트는 없음). 원하지 않으면 체크를 해제하고, 나중에 ‘설정 › 개인정보 보호’에서 바꿀 수 있습니다. ‘다음’을 누르면 앱이 이 컴퓨터의 Free 체험을 서버에 등록하므로 인터넷 연결이 한 번 필요합니다.</p>
${appShot({ slug: "app-onboarding-2", lang: "ko", alt: "이용 약관 단계. 접을 수 있는 문서 두 개, 필수 동의 체크박스, 미리 체크된 선택 항목인 오류 보고서 자동 전송 체크박스", caption: "9단계 중 2단계: 이용 약관." })}

<h3>3단계. 모델을 골라 내려받기</h3>
<p>앱은 메모리와 남은 디스크 공간을 보여 주고 팩을 추천합니다: RAM이 약 16GB 이상인 Mac(또는 RAM 16GB 이상에 VRAM 6GB의 외장 그래픽 카드가 있는 Windows PC)에는 <strong>Standard</strong> 팩(약 2.5GB), 그 밖의 컴퓨터에는 <strong>Lite</strong> 팩(약 1.3GB)입니다. 팩을 고르면 다음 화면에서 다운로드가 시작되며 ‘일시 중지’와 ‘재개’ 버튼이 있습니다. 내려받는 중에도 ‘다음’을 누를 수 있으며, 모델은 백그라운드에서 계속 내려받아집니다. 끝나면 앱에 ‘다운로드가 완료되었습니다. AI Translator로 번역할 준비가 되었습니다.’라고 표시됩니다.</p>
<div class="grid grid-2">
${appShot({ slug: "app-onboarding-3", lang: "ko", alt: "컴퓨터 확인 단계. 메모리, 남은 디스크 공간, 추천 모델 팩을 표시", caption: "9단계 중 3단계: 이 컴퓨터 확인, 팩 고르기." })}
${appShot({ slug: "app-onboarding-4", lang: "ko", alt: "모델 다운로드 단계. 진행률 막대와 일시 중지 버튼", caption: "9단계 중 4단계: 모델 다운로드." })}
</div>

<h3>4단계. 시스템 오디오 녹음 허용하기(macOS만)</h3>
<p>AI Translator가 처음 오디오를 캡처할 때 macOS는 <strong>시스템 오디오 녹음</strong> 권한을 요청합니다. 이 화면은 미리 알려 줄 뿐이며, macOS의 요청은 아래의 ‘사용해 보기’ 단계나 처음 ‘시작’을 누를 때 나타납니다. 허용하세요. 실수로 거부했다면 이 화면의 <strong>시스템 설정 열기</strong> 버튼으로 해당 위치로 갈 수 있습니다. 앱은 마이크를 쓰지 않습니다. 자세한 내용은 <a href="/ko/guide/macos-audio-permission/">시스템 오디오 녹음 권한 허용하기</a>를 참고하세요. Windows에는 이 단계가 없습니다.</p>
${appShot({ slug: "app-onboarding-5", lang: "ko", alt: "시스템 오디오 녹음 허용 단계와 시스템 설정 열기 버튼", caption: "9단계 중 5단계: 시스템 오디오 녹음 권한(macOS만)." })}

<h3>5단계. 언어 고르기</h3>
<p><strong>번역 언어</strong>에서 읽고 싶은 언어를 고릅니다. 회의에서 쓸 수 있는 언어에 체크합니다(기본값은 다섯 가지 모두). <strong>원본 언어</strong>는 ‘자동 감지’로 두거나, 회의에서 한 언어만 쓴다는 것을 안다면 그 언어로 고정합니다.</p>
${appShot({ slug: "app-onboarding-6", lang: "ko", alt: "언어 고르기 단계. 번역 언어 메뉴, 말하는 언어를 나타내는 둥근 칩 다섯 개, 원본 언어 메뉴", caption: "9단계 중 6단계: 언어 고르기." })}

<h3>6단계. 사용해 보기</h3>
<p><strong>샘플 문장 재생</strong>을 누릅니다. 앱이 스피커로 영어 문장을 재생하고, 그 자막이 자막 바에 나타나며, 이 화면에 ‘정상적으로 작동합니다. 번역: …’이라고 표시됩니다. Mac이 음소거되어 있다면 소리를 키우세요. 이때 macOS가 녹음 권한을 요청하면 허용합니다.</p>
${appShot({ slug: "app-onboarding-7", lang: "ko", alt: "사용해 보기 단계와 샘플 문장 재생 버튼", caption: "9단계 중 7단계: 사용해 보기." })}

<h3>7단계. 안내를 읽고 마치기</h3>
<p>오디오는 이 컴퓨터 밖으로 나가지 않습니다. 법이나 회사 규정상 필요하다면, 번역 도구를 쓰고 있다는 사실을 다른 참석자에게 알리는 것은 사용자의 책임입니다. 창을 닫으면 앱은 메뉴 막대(macOS)나 시스템 트레이(Windows)로 숨을 뿐입니다. Windows에서는 새 아이콘이 작업 표시줄의 ^ 화살표 뒤에 숨어 있을 수 있으며, 마지막 화면에서 꺼내는 방법을 알려 줍니다. <strong>AI Translator 시작하기</strong>를 누르면 홈 화면으로 갑니다.</p>
<div class="grid grid-2">
${appShot({ slug: "app-onboarding-8", lang: "ko", alt: "개인정보 단계. 오디오가 컴퓨터 밖으로 나가지 않으며, 필요하면 다른 참석자에게 알려야 한다는 안내", caption: "9단계 중 8단계: 개인정보." })}
${appShot({ slug: "app-onboarding-9", lang: "ko", alt: "마지막 단계. 창을 닫아도 AI Translator가 메뉴 막대에서 계속 실행된다는 안내", caption: "9단계 중 9단계: 메뉴 막대에서 계속 실행됩니다." })}
</div>

<h2 id="first-meeting">첫 회의 번역하기</h2>
<p>메인 창 왼쪽 사이드바의 각 화면에는 아이콘이 있습니다. 창이 좁으면 아이콘만 보이고, 마우스를 올리면 이름이 나타납니다.</p>
<ol>
<li>홈 화면의 <strong>언어</strong> 카드에서 ‘번역 언어’와 ‘회의에서 사용하는 언어’를 확인합니다.</li>
<li><strong>오디오 소스</strong> 카드의 기본값은 ‘시스템 전체(이 앱 제외)’입니다. 앱 하나만 번역하려면 <strong>변경</strong>을 누릅니다. Windows에서는 오디오 소스가 기본 재생 장치나 직접 고른 장치이며, 앱 하나만 고르는 기능은 아직 없습니다.</li>
<li>소리가 나는 회의나 동영상을 열고 <strong>시작</strong>을 누릅니다(또는 ${keys(["⌃", "⌥", "T"])}, Windows에서는 ${keys(["Ctrl", "Alt", "T"])}). 상태가 ‘시작 중’에서 ‘번역 중’으로 바뀝니다. 처음 몇 초 동안은 바에 ‘모델을 불러오는 중…’이라고 표시될 수 있습니다.</li>
<li>떠 있는 바의 자막을 읽습니다. 소리가 들어오면 바 오른쪽 위의 작은 점이 초록색으로 바뀌고, 홈 화면의 ‘입력 레벨’ 막대도 함께 움직입니다. 흐린 줄은 임시 자막이며, 문장이 완성되면 바뀝니다.</li>
<li>끝나면 <strong>중지</strong>를 누릅니다. 다 읽을 수 있도록 바에는 마지막 줄이 남아 있고, <strong>대본 열기</strong>가 나타나 시간, 원문, 번역을 보여 줍니다. <strong>모두 복사</strong>는 모든 요금제에서 쓸 수 있습니다.</li>
</ol>
${appShot({ slug: "app-home-running", lang: "ko", alt: "번역 중인 메인 화면: 번역 중 상태, 중지 버튼, 언어 카드, 입력 레벨 막대", caption: "번역 중인 홈 화면." })}
<p>바를 끌고, 잠그고, 숨기고, 모양을 바꾸는 방법은 <a href="/ko/guide/subtitle-bar-and-shortcuts/">자막 바와 단축키 가이드</a>에서 다룹니다. Free 요금제는 10일 체험 기간 동안 하루 30분까지 번역할 수 있습니다.</p>
${overlayShot({ slug: "overlay-default", lang: "ko", alt: "회의 화면 위에 원문을 작은 글씨로, 그 아래 번역을 보여 주는 기본 자막 바", caption: "기본 자막 바: 위에는 작은 원문, 아래에는 번역." })}

<h2 id="common-problems">처음 실행할 때 흔한 문제</h2>
<ul>
<li><strong>macOS에서 앱이 열리지 않습니다.</strong> 터미널에서 설치 명령을 실행하거나(앱이 바로 열립니다) 위의 ‘그래도 열기’ 단계를 따르세요. 자세한 내용은 <a href="/ko/guide/install-macos/">설치 가이드</a>에 있습니다.</li>
<li><strong>Windows에 ‘Windows의 PC 보호’가 표시됩니다.</strong> ‘추가 정보’를 누른 뒤 ‘실행’을 누르세요. 자세한 내용은 <a href="/ko/guide/install-windows/">Windows 설치 가이드</a>에 있습니다.</li>
<li><strong>자막이 나오지 않고 홈 화면에 ‘앱에서 소리가 나는데도 아무것도 들리지 않습니다…’라고 표시됩니다(macOS).</strong> macOS가 시스템 오디오 녹음을 허용하지 않은 상태입니다. <a href="/ko/guide/macos-audio-permission/">권한 가이드</a>를 참고하세요.</li>
<li><strong>샘플 문장의 자막이 나오지 않습니다.</strong> 스피커가 음소거되어 있지 않은지 확인하고 다시 해 보세요.</li>
<li><strong>모델 다운로드가 중간에 멈췄습니다.</strong> <strong>재개</strong>를 누르면 멈춘 곳부터 이어서 내려받습니다.</li>
<li><strong>자막 바가 보이지 않습니다.</strong> 숨겨져 있을 수 있습니다. 자막 바 카드에서 <strong>표시</strong>를 누르거나 ${keys(["⌃", "⌥", "H"])}를 누르세요(Windows: ${keys(["Ctrl", "Alt", "H"])}).</li>
<li><strong>처음 실행할 때 시간이 걸립니다.</strong> 설치나 업데이트 후에는 앱에 ‘처음 사용을 준비하고 있습니다. 몇 분 걸릴 수 있습니다.’라고 표시될 수 있습니다.</li>
</ul>
<p>그 밖의 문제는 <a href="/ko/guide/troubleshooting/">문제 해결</a>에서 다룹니다.</p>

${docNav(
  [
    { href: "/ko/guide/", kicker: "모든 가이드", title: "AI Translator 사용 가이드" },
    { href: "/ko/guide/install-macos/", kicker: "다음", title: "macOS에 AI Translator 설치하기" },
    { href: "/ko/guide/subtitle-bar-and-shortcuts/", kicker: "관련", title: "자막 바와 단축키" },
  ],
  "관련 가이드",
)}
`,
})}
</div></section>
`,
};
