import { pageHero, faq, keys, appShot, docLayout, docNav } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "가이드", path: "/ko/guide/" },
  { name: "문제 해결", path: "/ko/guide/troubleshooting/" },
];

const toc = [
  { level: 2, id: "no-audio", text: "자막이 안 나오거나 소리가 안 들림" },
  { level: 2, id: "slow-or-stopped", text: "자막이 늦거나 빠지거나 멈춤" },
  { level: 2, id: "models-macos", text: "모델, 설치, macOS와 Windows" },
  { level: 2, id: "license-quota", text: "라이선스, 번역 시간, 체험" },
  { level: 2, id: "type-and-translate", text: "입력 번역" },
  { level: 2, id: "send-logs", text: "로그 보내고 문제 알리기" },
  { level: 2, id: "quick-answers", text: "빠른 답변" },
];

const QUICK = [
  {
    q: "창을 닫았는데 앱이 계속 실행됩니다. 어떻게 종료하나요?",
    a: "<p>창을 닫으면 앱이 메뉴 막대(macOS)나 시스템 트레이(Windows)로 숨을 뿐입니다. 메뉴 막대나 트레이의 AI Translator 아이콘에서 <strong>종료</strong>를 고르세요. Mac에서는 ⌘Q로 종료되지 않습니다.</p>",
  },
  {
    q: "앱을 다시 설치하면 키를 잃거나 10일 체험이 다시 시작되나요?",
    a: "<p>아니요. 같은 컴퓨터에 다시 설치하는 것은 새 컴퓨터로 치지 않으며, 10일 체험은 컴퓨터마다 기록되므로 다시 시작할 수 없습니다.</p>",
  },
  {
    q: "로그에 회의에서 한 말이 드러나나요?",
    a: "<p>아니요. 로그에는 오디오도, 받아쓰기 텍스트도 들어 있지 않습니다. 앱에 오류가 생기면 개인 폴더 경로, 키, 토큰, 이메일 주소를 지운 로그의 관련 부분을 저희에게 보냅니다. 이 기능은 ‘설정 › 개인정보 보호’에서 끌 수 있습니다.</p>",
  },
];

export default {
  id: "guide-troubleshooting",
  lang: "ko",
  path: "/ko/guide/troubleshooting/",
  title: "문제 해결: 흔한 오류와 해결 방법",
  description:
    "AI Translator의 증상, 원인, 해결 방법: 자막이 안 나옴, 소리가 안 들림, 모델 다운로드 오류, 잠긴 키, 번역 시간 소진. 지원팀에 로그를 보내는 방법.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [faqPage(QUICK.map((f) => ({ q: f.q, a: f.a })))],
  body: () => `
${pageHero({
  crumbs,
  title: "문제 해결",
  lead: "AI Translator의 문제는 대부분 녹음 권한, 오디오 소스, 모델, 라이선스의 네 가지로 나뉩니다. 아래 표에서 앱에 나온 그대로의 메시지를 찾아 해결 방법을 따르세요. 그래도 안 되면 로그를 지원팀에 보내 주세요.",
  meta: `<span>업데이트 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "이 페이지의 내용",
  body: `
<h2 id="no-audio">자막이 안 나오거나 소리가 안 들릴 때</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">‘앱에서 소리가 나는데도 아무것도 들리지 않습니다. AI Translator가 시스템 오디오를 녹음하도록 허용되지 않았을 수 있습니다.’</span><p><strong>원인:</strong> macOS가 권한을 주지 않았고 오류도 보여 주지 않습니다. 앱에는 무음만 들어옵니다.</p><p><strong>해결:</strong> <strong>시스템 설정 열기</strong>를 누르고 ‘개인정보 보호 및 보안 › 화면 및 시스템 오디오 녹음 › 시스템 오디오 녹음만’에서 AI Translator를 켠 뒤, 다시 <strong>시작</strong>을 누르세요. <a href="/ko/guide/macos-audio-permission/">오디오 권한 가이드</a>를 참고하세요. Windows에는 이런 권한이 없습니다. 아무것도 들리지 않으면 ‘설정 › 오디오’에서 고른 재생 장치를 확인하세요.</p></div>
<div class="card"><span class="card-title">‘소리가 들리지 않습니다. 회의 소리가 재생되고 있는지 확인하세요.’ 또는 ‘오디오를 캡처하지 못했습니다.’</span><p><strong>원인:</strong> 재생 중인 것이 없거나, 오디오 소스가 틀렸거나, 앱이 오디오 소스를 열지 못했습니다.</p><p><strong>해결:</strong> 회의 소리를 켜세요. ‘설정 › 오디오’에서 <strong>목록 새로 고침</strong>을 누르고 오디오 소스를 다시 고른 뒤 다시 <strong>시작</strong>을 누르세요. 계속되면 로그를 보내 주세요.</p></div>
<div class="card"><span class="card-title">‘선택한 앱에서 소리가 나지 않습니다’</span><p><strong>원인:</strong> <strong>{앱 이름}만</strong>을 골랐는데 그 앱이 조용합니다.</p><p><strong>해결:</strong> 그 앱에서 소리가 나게 하거나(번역이 바로 다시 시작됨), <strong>시스템 전체(이 앱 제외)</strong>를 고르세요(다음 세션부터 적용).</p></div>
<div class="card"><span class="card-title">자막 바가 보이지 않음</span><p><strong>원인:</strong> 앱을 열 때 바는 ‘시작’을 누르기 전까지 숨겨져 있습니다. 또는 단축키나 ✕ 버튼으로 바를 숨겼습니다(✕ 버튼은 번역도 멈춥니다).</p><p><strong>해결:</strong> ✕를 눌렀다면 <strong>시작</strong>을 눌러 다시 번역하면 바가 돌아옵니다. 그렇지 않다면 홈 화면의 <strong>자막 바</strong>에서 <strong>표시</strong>를 누르거나, ${keys(["⌃", "⌥", "H"])}(Windows: ${keys(["Ctrl", "Alt", "H"])})를 누르거나, 메뉴 막대나 트레이 메뉴에서 ‘자막 표시’를 고르세요. 잠겨 있다면 ${keys(["⌃", "⌥", "L"])}(Windows: ${keys(["Ctrl", "Alt", "L"])})로 잠금을 푸세요.</p></div>
<div class="card"><span class="card-title">‘등록하지 못한 단축키가 있습니다. 설정 › 단축키에서 변경하세요.’</span><p><strong>원인:</strong> 다른 앱이 이미 그 키 조합을 쓰고 있습니다.</p><p><strong>해결:</strong> ‘설정 › 단축키’에서 <strong>변경</strong>을 누르고, Ctrl, Alt, Cmd/Win 중 하나 이상이 들어간 새 조합을 누르세요(Shift만으로는 안 됩니다).</p></div>
</div>

<h2 id="slow-or-stopped">자막이 늦거나 빠지거나 멈출 때</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">‘처리가 따라가지 못하고 있습니다’, ‘CPU로 실행 중입니다(속도가 느려집니다).’, ‘이 컴퓨터의 메모리가 부족했습니다. Lite 모델 팩을 권장합니다.’</span><p><strong>원인:</strong> 컴퓨터가 말의 속도를 따라가지 못하거나, GPU에 오류가 생겨 앱이 CPU로 옮겼습니다.</p><p><strong>해결:</strong> 무거운 앱을 닫으세요. ‘설정 › 모델’에서 Lite 팩을 고르고 <strong>이 팩 사용</strong>을 누르세요(아직 내려받지 않았다면 <strong>다운로드하고 사용</strong>). 새 팩은 다음 세션부터 쓰입니다.</p></div>
<div class="card"><span class="card-title">‘번역 사용 불가: 원문만 표시’, ‘오류로 번역이 중지되었습니다. 자세한 내용은 메인 창을 열어 확인하세요.’, ‘음성 인식이 작동을 멈췄습니다. …’</span><p><strong>원인:</strong> 번역이나 음성 인식에 오류가 생겼습니다. 앱이 스스로 다시 시작하지만, 10분 안에 5번 넘게 실패하면 번역을 멈춥니다.</p><p><strong>해결:</strong> <strong>중지</strong>를 누른 뒤 <strong>시작</strong>을 누르세요. 앱이 일부가 없거나 손상되었다고 하면 AI Translator를 다시 설치하세요. 되풀이되면 로그를 보내 주세요.</p></div>
</div>

<h2 id="models-macos">모델, 설치, macOS와 Windows</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">‘모델 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.’</span><p><strong>원인:</strong> 연결이 없거나 네트워크가 다운로드를 막고 있습니다.</p><p><strong>해결:</strong> 네트워크를 확인한 뒤 <strong>다시 시도</strong>를 누르세요.</p></div>
<div class="card"><span class="card-title">‘다운로드가 끝나지 않았습니다. 재개를 누르면 중단된 곳부터 이어집니다.’ 또는 ‘다운로드한 파일이 손상되었습니다. …’</span><p><strong>원인:</strong> 연결이 끊겼거나, 파일이 무결성 검사를 통과하지 못했습니다.</p><p><strong>해결:</strong> <strong>재개</strong>를 누르세요. 앱에 ‘모델이 손상되었습니다. 다시 다운로드하세요.’라고 나오면 ‘설정 › 모델’에서 <strong>확인 후 다시 다운로드</strong>를 누르세요.</p></div>
<div class="card"><span class="card-title">‘디스크 여유 공간이 부족합니다. …’ 또는 ‘모델 파일을 디스크에 쓰지 못했습니다.’</span><p><strong>원인:</strong> 디스크에는 다운로드 크기에 1GB를 더한 여유 공간이 필요합니다(Standard는 약 2.5GB, Lite는 약 1.3GB).</p><p><strong>해결:</strong> 디스크 공간을 비우거나 Lite 팩을 고르세요.</p></div>
<div class="card"><span class="card-title">‘이 컴퓨터는 최소 요구 사양을 충족하지 않아 모델을 다운로드할 수 없습니다.’</span><p><strong>원인:</strong> 최소 사양에 못 미칩니다: Apple 실리콘에 RAM 8GB인 Mac, 또는 RAM 8GB에 AVX2를 지원하는 CPU가 있는 Windows 10/11 x64 PC. 앱이 ‘이 컴퓨터의 프로세서에는 AI Translator에 필요한 AVX2가 없습니다. …’처럼 이유를 알려 줍니다.</p><p><strong>해결:</strong> 사양을 충족하는 컴퓨터를 쓰세요. 요구 사항은 <a href="/ko/download/">다운로드 페이지</a>를 참고하세요.</p></div>
<div class="card"><span class="card-title">처음 앱을 열 때 macOS가 개발자를 확인할 수 없다고 함</span><p><strong>원인:</strong> 브라우저로 내려받은 .dmg에서 앱을 열었고, macOS 빌드는 애드혹 서명이며 아직 Apple의 공증을 받지 않았습니다.</p><p><strong>해결:</strong> 가장 빠른 방법은 <a href="/ko/download/#install-macos">터미널에서 설치 명령</a>을 다시 실행하는 것입니다(앱이 바로 열림). 또는 <strong>완료</strong>를 누르고 ‘시스템 설정 › 개인정보 보호 및 보안’을 열어 맨 아래로 스크롤한 뒤 AI Translator 옆의 <strong>그래도 열기</strong>를 누르세요. <a href="/ko/guide/install-macos/">macOS에 설치</a>를 참고하세요.</p></div>
<div class="card"><span class="card-title">업데이트 후 macOS가 로그인 암호를 물음</span><p><strong>원인:</strong> 애드혹 서명 빌드에서는 정상입니다. 업데이트마다 키체인 대화상자 1개(0.1.0에서 0.1.1로의 첫 업데이트는 5개)와, 녹음 권한을 한 번 더 물을 수 있습니다.</p><p><strong>해결:</strong> 암호를 입력하고 <strong>항상 허용</strong>을 누른 뒤 녹음 권한을 허용하세요.</p></div>
<div class="card"><span class="card-title">설치 프로그램을 열면 Windows에 ‘Windows의 PC 보호’가 표시됨</span><p><strong>원인:</strong> 브라우저로 내려받은 .exe를 열었고, Windows 빌드는 아직 코드 서명되지 않아 Microsoft Defender SmartScreen이 막을 수 있습니다.</p><p><strong>해결:</strong> 가장 빠른 방법은 <a href="/ko/download/#install-windows">PowerShell에서 설치 명령</a>을 다시 실행하는 것입니다(SmartScreen 없음). 또는 SHA-256을 확인하고, <strong>추가 정보</strong>를 눌러 ‘앱’ 줄에 설치 프로그램의 파일 이름이 보이는지 확인한 뒤 <strong>실행</strong>을 누르세요. ‘실행’ 버튼이 없다면 PC의 정책이 막고 있을 수 있으니 컴퓨터를 관리하는 사람에게 문의하세요. <a href="/ko/guide/install-windows/">Windows에 설치</a>를 참고하세요.</p></div>
<div class="card"><span class="card-title">백신 프로그램이 Windows 설치 프로그램을 막거나 지움</span><p><strong>원인:</strong> 설치 프로그램이 코드 서명되지 않았고 아직 많이 다운로드되지 않아, 일부 제품이 의심스럽게 봅니다.</p><p><strong>해결:</strong> SHA-256을 다시 확인하세요. 일치하는데도 막힌다면, 쓰는 백신 프로그램 이름을 알려 주시며 <a href="/ko/contact/">지원팀에 문의</a>하세요.</p></div>
</div>

<h2 id="license-quota">라이선스, 번역 시간, 체험</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">‘번역 시간을 모두 사용했습니다 · …에 초기화’</span><p><strong>원인:</strong> 오늘의 30분(Free)이나 이번 주기의 시간(Monthly: 50시간, 6 Months: 100시간)을 다 썼습니다.</p><p><strong>해결:</strong> 화면에 나온 초기화 시각까지 기다리거나, <a href="/ko/guide/buy-and-activate/">갱신 또는 요금제 변경</a>을 하세요.</p></div>
<div class="card"><span class="card-title">‘10일 체험이 종료되었습니다’</span><p><strong>원인:</strong> Free는 컴퓨터마다 10일 체험이며, 다시 설치해도 다시 시작되지 않습니다.</p><p><strong>해결:</strong> 계속 번역하려면 Monthly, 6 Months, Yearly를 구매하세요.</p></div>
<div class="card"><span class="card-title">‘무료 체험을 시작하려면 인터넷에 한 번 연결하세요’ 또는 ‘플랜을 14일 동안 확인하지 못해 Free를 사용 중입니다. 인터넷에 연결하세요.’</span><p><strong>원인:</strong> 연결이 없어 체험을 등록하지 못했거나, 유료 요금제가 라이선스 확인 없이 14일을 넘겼습니다.</p><p><strong>해결:</strong> 인터넷에 연결하세요. 이 컴퓨터가 아직 체험을 등록하지 않았다면 다시 <strong>시작</strong>을 눌러 앱이 등록하게 하세요. 유료 요금제라면 ‘설정 › 라이선스’에서 <strong>지금 확인</strong>을 누르세요.</p></div>
<div class="card"><span class="card-title">‘이 키는 컴퓨터 2대에서 사용 중이어서 잠겼습니다. …’</span><p><strong>원인:</strong> 키를 컴퓨터 두 대가 쓰고 있습니다.</p><p><strong>해결:</strong> 한 컴퓨터에서 키를 제거한 뒤 <strong>다시 시도</strong>를 누르세요. <a href="/ko/guide/buy-and-activate/#switch-computers">컴퓨터 바꾸는 방법</a>을 참고하세요.</p></div>
<div class="card"><span class="card-title">‘컴퓨터 시계가 잘못된 것 같습니다. 올바른 시간으로 설정한 다음 다시 시도하세요.’ 또는 ‘이 컴퓨터의 시계가 과거로 돌려졌습니다. …’</span><p><strong>원인:</strong> 시스템 시계가 과거로 돌려졌습니다.</p><p><strong>해결:</strong> 올바른 시간으로 설정하고(가능하면 자동), 앱이 확인할 수 있도록 인터넷에 연결하세요.</p></div>
<div class="card"><span class="card-title">‘이 키는 올바르지 않습니다. …’, ‘컴퓨터를 너무 자주 바꿔서 이 키가 일시적으로 잠겼습니다. …’, ‘이 AI Translator는 정품이 아니므로 …’</span><p><strong>원인:</strong> 키를 잘못 입력했거나, 컴퓨터를 너무 많이 바꿨거나, 공식이 아닌 설치 파일입니다.</p><p><strong>해결:</strong> 이메일의 키를 다시 붙여 넣으세요. 키가 잠겼다면 지원팀에 문의하세요. 저희가 보내 드린 링크나 aitranslator.io.vn에서 공식 빌드를 다시 내려받으세요.</p></div>
</div>

<h2 id="type-and-translate">입력 번역</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">⌃⌥G(Ctrl+Alt+G)를 눌러도 입력 상자가 열리지 않음</span><p><strong>원인:</strong> 입력 번역이 꺼져 있거나, 다른 앱이 그 단축키를 쓰고 있습니다.</p><p><strong>해결:</strong> ‘설정 › 입력 번역’에서 켜세요. Windows에서 ‘설정 › 단축키’에 단축키가 등록되지 않았다고 나오면 다른 것을 고르세요. macOS에서 다른 앱도 ⌃⌥G를 쓴다면 둘 중 하나의 단축키를 바꾸세요.</p></div>
<div class="card"><span class="card-title">‘번역을 복사했습니다. 자동으로 붙여넣으려면 손쉬운 사용에서 AI Translator를 허용하세요.’</span><p><strong>원인:</strong> macOS가 AI Translator에 손쉬운 사용 권한을 주지 않았거나, 앱 업데이트 후 권한이 사라졌습니다.</p><p><strong>해결:</strong> 이번에는 채팅 입력란에서 ⌘V를 눌러 붙여 넣으세요. 앱이 대신 붙여 넣게 하려면 <strong>자동 붙여넣기 켜기</strong>를 누르고 손쉬운 사용에서 AI Translator를 켜세요. 이미 켰는데도 앱이 계속 묻는다면(앱 업데이트 후에 흔함): 0.1.14 버전부터는 <strong>자동 붙여넣기 켜기</strong> 버튼이 이전 권한을 스스로 지우므로 한 번 더 켜기만 하면 됩니다. 그보다 이전 버전에서는 목록에서 AI Translator를 빼고(− 버튼) 다시 추가하세요(+ 버튼). <a href="/ko/guide/type-and-translate/#accessibility">입력 번역</a>을 참고하세요.</p></div>
<div class="card"><span class="card-title">Enter를 눌러도 번역이 채팅 입력란에 들어가지 않음</span><p><strong>원인:</strong> 그 칸이 자동 붙여넣기를 받지 않거나(암호 입력란, Windows에서 관리자 권한으로 실행 중인 앱, 붙여넣기를 막는 앱), 채팅 창이 제때 앞으로 오지 않았습니다.</p><p><strong>해결:</strong> 번역은 클립보드에 남아 있습니다. 채팅 입력란을 클릭하고 ⌘V나 Ctrl+V로 붙여 넣으세요.</p></div>
<div class="card"><span class="card-title">‘한 줄이 너무 길어 번역할 수 없습니다. 여러 줄이나 여러 메시지로 나누세요.’</span><p><strong>원인:</strong> 메시지의 한 줄이 너무 길어 한 번에 번역할 수 없습니다(메시지 전체는 4000자까지 가능).</p><p><strong>해결:</strong> Shift+Enter로 알맞은 곳에서 줄을 바꾸거나, 여러 메시지로 나누세요.</p></div>
</div>

<h2 id="send-logs">로그 보내고 문제 알리기</h2>
<p>앱에 오류가 생기면(갑자기 멈춤, 앱 오류로 번역 세션이 멈춤, 보조 프로그램이 멈췄다가 다시 시작됨) 앱이 <strong>오류 보고서를 저희에게 자동으로 보냅니다</strong>. 기기 정보와 로그의 관련 부분이며, 개인 폴더 경로, 키, 토큰, 이메일 주소는 지워지고 오디오나 받아쓰기 텍스트는 들어 있지 않습니다. 보고서는 앱이 번역하지 않을 때만 보냅니다. 기본적으로 켜져 있으며, <strong>설정 › 개인정보 보호 › 오류 보고서 자동 전송</strong>에서 끌 수 있습니다. <a href="/ko/data-security/#error-reports">보고서에 들어가는 것과 보관 기간</a>을 참고하세요.</p>
<p>앱이 멈추지 않는 문제(예: 자막이 틀리거나 느림)는 <strong>정보 › 지원팀에 로그 보내기</strong>로 가세요. 자동 전송을 꺼 두었더라도 보고서를 바로 보내고 <strong>보고서 코드</strong>(<code>R-XXXX-XXXX</code> 형식)를 보여 줍니다. 저희가 보고서를 찾을 수 있도록 그 코드를 <a href="/ko/contact/">지원팀</a>(support@aitranslator.io.vn)에 보내는 메일에 적어 주세요.</p>
<p>로그를 직접 보거나 첨부하려면 <strong>정보 › 로그 폴더 열기</strong>를 열어 <code>app.log</code>를 찾으세요(macOS: <code>~/Library/Logs/</code> 안의 <code>com.aitranslator.desktop</code> 폴더, Windows: <code>%LOCALAPPDATA%\\com.aitranslator.desktop\\logs\\</code>). 이 파일은 컴퓨터에 남아 있으며 오디오, 받아쓰기 텍스트, 전체 라이선스 키는 들어 있지 않습니다.</p>
${appShot({
  slug: "app-about",
  lang: "ko",
  alt: "정보 화면: 앱 이름, 버전 줄, 로그 폴더 열기와 지원팀에 로그 보내기 버튼, 약관 및 개인정보 항목",
  caption: "정보: 버전, 로그 폴더 열기, 지원팀에 로그 보내기.",
})}
<p>표대로 해 봤는데도 문제가 되풀이되거나, 키가 잠기거나 취소되었거나, 결제가 잘못되었을 때는 지원팀에 문의하세요. 다음을 함께 보내 주세요:</p>
<ul>
<li>앱 버전(정보 › ‘버전 …’, 또는 왼쪽 사이드바 아래쪽, 예: ‘Monthly · v0.1.6’), macOS나 Windows 버전, 칩이나 프로세서(예: MacBook Air M2), RAM, Windows PC라면 그래픽 카드.</li>
<li>모델 팩(Standard 또는 Lite, ‘설정 › 모델’)과 라이선스 요금제.</li>
<li>나온 그대로의 메시지나 스크린숏, 쓰는 회의 앱, 방금 한 일.</li>
<li>보고서 코드(‘지원팀에 로그 보내기’를 눌렀다면)와, 결제 문제라면 주문 번호. 첨부하고 싶다면 <code>app.log</code>.</li>
</ul>

<h2 id="quick-answers">빠른 답변</h2>
${faq(QUICK)}
`,
})}
${docNav(
  [
    { href: "/ko/guide/buy-and-activate/", kicker: "이전", title: "요금제 구매, 키 활성화, 컴퓨터 바꾸기" },
    { href: "/ko/faq/", kicker: "함께 보기", title: "자주 묻는 질문" },
  ],
  "관련 가이드",
)}
</div></section>
`,
};
