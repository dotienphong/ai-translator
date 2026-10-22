import { pageHero, callout, facts, appShot, overlayShot, keys, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "가이드", path: "/ko/guide/" },
  { name: "입력 번역", path: "/ko/guide/type-and-translate/" },
];

const toc = [
  { level: 2, id: "how-to-use", text: "입력 번역의 작동 방식" },
  { level: 2, id: "keys", text: "입력 상자의 키" },
  { level: 2, id: "language", text: "어떤 언어로 번역하나요" },
  { level: 2, id: "accessibility", text: "macOS 자동 붙여넣기: 손쉬운 사용" },
  { level: 2, id: "windows", text: "Windows에서" },
  { level: 2, id: "when-paste-fails", text: "제한과 붙여넣기에 실패할 때" },
  { level: 2, id: "privacy", text: "입력한 텍스트는 어디로 가나요" },
];

export default {
  id: "guide-type-translate",
  lang: "ko",
  path: "/ko/guide/type-and-translate/",
  title: "입력 번역: 채팅을 번역해 붙여넣기",
  description:
    "AI Translator 입력 번역 사용법: ⌃⌥G 또는 Ctrl+Alt+G를 누르고 내 언어로 입력한 뒤 Enter를 누르면 쓰고 있는 채팅 입력란에 번역이 붙여 넣어집니다.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-17",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "AI Translator 입력 번역으로 번역한 메시지 보내기",
      description: "AI Translator 입력 상자에 내 언어로 메시지를 쓰고, 번역을 채팅 입력란에 붙여 넣어 보냅니다.",
      totalTime: "PT1M",
      steps: [
        { name: "채팅 입력란 클릭하기", text: "쓰고 있는 채팅 앱이나 웹 페이지를 열고 메시지를 입력하는 칸을 클릭합니다." },
        { name: "입력 상자 열기", text: "macOS에서는 ⌃⌥G, Windows에서는 Ctrl+Alt+G를 누릅니다. 화면 가운데에 입력 번역 상자가 나타나고 커서가 이미 그 안에 있습니다." },
        { name: "메시지 입력하기", text: "내 언어로 입력합니다. 잠시 멈추면 아래에 번역이 나타납니다." },
        { name: "Enter를 눌러 붙여넣기", text: "입력 상자가 닫히고 번역이 채팅 입력란에 붙여 넣어집니다. 아직 아무것도 보내지 않았습니다." },
        { name: "Enter를 한 번 더 눌러 보내기", text: "채팅 입력란의 번역을 확인한 뒤 채팅 앱의 Enter를 눌러 보냅니다." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "입력 번역",
  lead: "입력 번역을 쓰면 지금 쓰고 있는 앱의 채팅 입력란에서 다른 언어를 쓰는 사람에게 메시지를 보낼 수 있습니다. 떠 있는 입력 상자에 내 언어로 입력하면 AI Translator가 컴퓨터에서 번역한 뒤 그 번역을 채팅 입력란에 붙여 넣으므로, 확인하고 보내면 됩니다.",
  meta: `<span>업데이트 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "이 가이드의 내용",
  body: `
${facts([
  ["단축키", "macOS는 ⌃⌥G, Windows는 Ctrl+Alt+G<small>‘설정 › 단축키’에서 바꿀 수 있습니다</small>"],
  ["요금제", "활성화된 모든 요금제<small>체험 기간의 Free 포함. 번역 시간을 쓰지 않습니다</small>"],
  ["언어", "English, 中文, 日本語, 한국어, Tiếng Việt<small>기본값은 대화 상대의 언어</small>"],
  ["길이", "메시지당 최대 4000자<small>너무 긴 줄은 나누세요</small>"],
  ["네트워크", "필요 없음<small>컴퓨터에서 번역합니다</small>"],
  ["macOS 자동 붙여넣기", "손쉬운 사용 권한 필요<small>권한이 없으면 번역을 복사하므로 직접 붙여 넣습니다</small>"],
])}

<h2 id="how-to-use">입력 번역은 어떻게 작동하나요?</h2>
<ol>
<li>쓰고 있는 앱(Messenger, Slack, Zalo, Zoom 채팅 등)의 채팅 입력란을 입력하려는 것처럼 클릭합니다.</li>
<li>macOS에서는 ${keys(["⌃", "⌥", "G"])}, Windows에서는 ${keys(["Ctrl", "Alt", "G"])}를 누릅니다. 마우스 포인터가 있는 화면 가운데에 <strong>입력 번역</strong> 상자가 나타나고 커서가 이미 그 안에 있습니다. 채팅 앱은 앞에 그대로 있고, 채팅 입력란의 내용도 그대로 남습니다.</li>
<li>내 언어로 메시지를 입력합니다. 0.5초쯤 멈추면 AI Translator가 입력한 내용 전체를 번역하며, 번역은 만들어지는 대로 아래에 나타납니다. 계속 입력하면 다시 번역합니다.</li>
<li><strong>Enter</strong>를 누릅니다. 입력 상자가 닫히고, 커서가 채팅 입력란으로 돌아가며, 그곳에 번역이 붙여 넣어집니다. <strong>아직 아무것도 보내지 않았습니다.</strong></li>
<li>채팅 입력란의 번역을 확인하고 필요하면 고친 뒤, (채팅 앱에서) Enter를 눌러 보냅니다.</li>
</ol>
${overlayShot({
  slug: "compose-done",
  lang: "ko",
  alt: "입력 번역 상자: 입력란에 한국어 메시지, 그 아래 영어 번역, 아래쪽에 Enter: 붙여넣기 · Shift+Enter: 줄 바꿈 · Esc: 닫기",
  caption: "번역이 준비된 입력 번역 상자: Enter를 누르면 채팅 입력란에 붙여 넣습니다.",
})}
<p>입력 상자 맨 위 줄에는 번역할 언어와 진행 상태가 표시됩니다: ‘모델을 불러오는 중…’(앱을 한동안 쓰지 않은 뒤 처음), ‘번역 중…’, 또는 메시지가 이미 번역할 언어로 되어 있으면 ‘이미 English입니다’(이때 Enter를 누르면 입력한 그대로 붙여 넣습니다). 번역이 아직 입력 내용과 맞지 않는 동안에는 흐리게 표시됩니다.</p>
<p>Esc나 단축키로 닫거나 상자 밖을 클릭해 닫아도 초안은 남습니다. 다시 열면 텍스트가 그대로 있고, 덮어 쓸 수 있도록 이미 선택되어 있습니다. 붙여 넣은 뒤에는 상자가 비며, 앱을 종료하면 초안은 사라집니다.</p>
${callout({
  title: "자막과 마찬가지로 모델을 내려받아야 합니다.",
  text: "입력 번역은 자막과 같은 번역 모델을 쓰므로, 모델 팩을 내려받아 두어야 합니다(설정 › 모델). 자막이 실행 중일 때도 쓸 수 있지만, 이때는 메시지를 번역할 때마다 자막이 조금 늦게 나타날 수 있습니다. 입력 번역은 용어집을 쓰지 않습니다.",
})}

<h2 id="keys">입력 상자의 키</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">키</th><th scope="col">하는 일</th></tr></thead>
<tbody>
<tr><th scope="row">Enter</th><td>번역을 채팅 입력란에 붙여 넣습니다. 번역 중이면 번역이 끝난 뒤 붙여 넣습니다. 번역에 실패하면 다시 번역합니다. 번역에 실패한 뒤 앱이 <strong>원문을 붙여 넣는 일은 절대 없습니다</strong>. 상자가 비어 있으면 상자를 닫습니다.</td></tr>
<tr><th scope="row">Shift+Enter</th><td>줄을 바꿉니다. 줄마다 따로 번역되며, 번역에서도 줄이 유지됩니다.</td></tr>
<tr><th scope="row">Esc</th><td>붙여 넣지 않고 입력 상자를 닫으며, 초안은 남깁니다.</td></tr>
<tr><th scope="row">${keys(["⌃", "⌥", "G"])} / ${keys(["Ctrl", "Alt", "G"])}</th><td>입력 상자가 열려 있을 때: Esc처럼 닫습니다.</td></tr>
<tr><th scope="row">상자 밖 클릭</th><td>Esc처럼 닫습니다.</td></tr>
</tbody></table></div>
<p>입력기가 글자를 고르는 동안에는(일본어, 중국어, 한국어 입력) Enter가 글자를 확정할 뿐 붙여 넣지 않습니다. 단축키는 <strong>설정 › 단축키</strong>의 ‘입력 번역 열기’ 줄에서 바꿀 수 있습니다(<a href="/ko/guide/subtitle-bar-and-shortcuts/">자막 바와 단축키</a> 참고).</p>

<h2 id="language">어떤 언어로 번역하나요?</h2>
<p>기본적으로 <strong>대화 상대의 언어</strong>로 번역하며, 이는 자막 설정에서 정해집니다: ‘자동은 자막 설정에서 상대방의 언어를 가져옵니다. 회의 언어가 하나뿐이면 그 언어, 아니면 English(자막이 English이면 Tiếng Việt)입니다.’ 예를 들어 자막을 한국어로 읽고 원본 언어를 영어로 고정했다면, 입력 번역은 영어로 번역합니다.</p>
<p>항상 같은 언어를 쓰려면 <strong>설정 › 입력 번역</strong>을 열고 <strong>번역 언어</strong>에서 고릅니다: ‘자동(현재: …)’ 또는 다섯 언어 중 하나. 이 그룹에는 <strong>입력 번역 켜기</strong> 스위치도 있으며, 끄면 입력 상자 단축키가 아무것도 하지 않습니다(고른 단축키는 유지됩니다).</p>
${appShot({
  slug: "app-settings-compose",
  lang: "ko",
  alt: "입력 번역 설정 그룹: 입력 번역 켜기 스위치, 번역 언어는 자동, 채팅 입력란에 자동으로 붙여넣기 스위치, 허용됨으로 표시된 손쉬운 사용 권한 행과 손쉬운 사용 설정 열기 버튼",
  caption: "macOS의 ‘설정 › 입력 번역’.",
})}

<h2 id="accessibility">macOS 자동 붙여넣기: 손쉬운 사용 권한</h2>
<p>번역을 다른 앱에 대신 붙여 넣으려면 macOS가 <strong>손쉬운 사용</strong> 권한을 요구합니다. AI Translator는 입력 중인 채팅 입력란에 붙여넣기 키 ⌘V를 보내는 데만 이 권한을 쓰며, 다른 앱의 텍스트나 내용을 읽지 않습니다.</p>
<ol>
<li>권한 없이 처음 Enter를 누르면 입력 상자가 열린 채로 남습니다. 번역은 복사되었고, 상자에 ‘번역을 복사했습니다. 자동으로 붙여넣으려면 손쉬운 사용에서 AI Translator를 허용하세요. 이미 켰는데도 이 안내가 계속 나오면(업데이트 후에 흔함) “자동 붙여넣기 켜기”를 눌러 허용을 새로 고치세요.’라고 표시됩니다. Enter나 Esc를 누른 뒤 채팅 입력란에서 직접 ⌘V로 붙여 넣어도 됩니다.</li>
<li><strong>자동 붙여넣기 켜기</strong>를 누릅니다. macOS가 ‘시스템 설정 › 개인정보 보호 및 보안 › 손쉬운 사용’을 열면 AI Translator 스위치를 켭니다.</li>
<li>권한을 주고 싶지 않다면 <strong>항상 복사만</strong>을 누릅니다. 그 뒤로 Enter는 번역을 복사하고 입력 상자를 닫기만 하며, ⌘V로 붙여 넣습니다. 되돌리려면 <strong>설정 › 입력 번역 › 채팅 입력란에 자동으로 붙여넣기</strong>에서 바꿉니다.</li>
</ol>
<p>권한 상태는 ‘설정 › 입력 번역’의 <strong>손쉬운 사용 권한</strong> 행(‘허용되었습니다.’ 또는 ‘허용되지 않았습니다. …’)에 <strong>손쉬운 사용 설정 열기</strong> 버튼과 함께 표시됩니다.</p>
${callout({
  kind: "warn",
  title: "앱을 업데이트한 뒤 권한을 다시 켜야 할 수 있습니다.",
  text: "macOS 버전은 아직 Apple 개발자 인증서로 서명되지 않아, 업데이트할 때마다 macOS가 AI Translator를 다른 앱으로 볼 수 있습니다. 손쉬운 사용의 항목은 켜져 있는데도 앱은 여전히 허용되지 않았다고 표시합니다. 0.1.14 버전부터는 <strong>자동 붙여넣기 켜기</strong>(권한 안내 상자) 또는 <strong>손쉬운 사용 설정 열기</strong>(설정)를 누르면 앱이 이전 권한을 스스로 지우므로, 스위치를 한 번 더 켜기만 하면 됩니다. 그보다 이전 버전에서는 목록에서 AI Translator를 빼고(− 버튼) 다시 추가하세요(+ 버튼). 스위치를 껐다가 다시 켜는 것만으로는 해결되지 않습니다. 권한을 받기 전까지도 입력 번역은 번역을 복사하므로 직접 붙여 넣을 수 있습니다.",
})}

<h2 id="windows">Windows에서</h2>
<p>Windows에서는 권한이 필요 없습니다. Enter를 누르면 AI Translator가 채팅하던 창을 다시 앞으로 가져와 Ctrl+V를 보냅니다. 그 창이 닫혔거나 제때 앞으로 오지 않으면, 앱은 번역을 복사만 하므로(다른 창에 키를 보내지 않음) 직접 Ctrl+V로 붙여 넣으면 됩니다.</p>

<h2 id="when-paste-fails">제한과 붙여넣기에 실패할 때</h2>
<ul>
<li><strong>시험한 환경:</strong> macOS의 Chrome과 Safari 브라우저, 텍스트 편집기, 메모, Slack, Teams, Telegram(세 채팅 앱은 저희 자신과의 개인 채팅에서만). 모든 채팅 앱을 시험하지는 않았습니다. 붙여넣기는 입력 중인 칸에 ⌘V(Ctrl+V)를 보내는 방식이므로, 붙여넣기를 받는 칸이라면 대개 작동합니다. 이상하게 동작하는 앱이 있다면 <a href="/ko/contact/">문의</a> 페이지로 알려 주세요.</li>
<li><strong>번역은 항상 클립보드에 있습니다.</strong> 붙여 넣은 뒤에도 번역은 클립보드에 남습니다(원래 있던 내용을 대신함). 채팅 입력란에 텍스트가 나타나지 않으면 입력란을 클릭하고 직접 ⌘V나 Ctrl+V로 붙여 넣으세요.</li>
<li><strong>자동 붙여넣기를 받지 않는 칸도 있습니다:</strong> 암호 입력란(macOS가 다른 앱이 보낸 키를 그곳에서 막음), Windows에서 관리자 권한으로 실행 중인 앱, 붙여넣기를 막는 앱. 앱은 이런 경우를 알아낼 수 없습니다.</li>
<li><strong>메시지당 최대 4000자.</strong> 한 줄이 너무 길면 입력 상자에 ‘한 줄이 너무 길어 번역할 수 없습니다. 여러 줄이나 여러 메시지로 나누세요.’라고 표시됩니다.</li>
<li><strong>번역 실패:</strong> 입력 상자에 ‘번역하지 못했습니다. Enter를 눌러 다시 시도하세요.’라고 표시됩니다.</li>
<li><strong>단축키로 입력 상자가 열리지 않습니다:</strong> ‘설정 › 입력 번역’이 켜져 있는지 확인하세요. Windows에서는 다른 앱이 그 단축키를 쓰고 있을 수 있으니(‘설정 › 단축키’에 등록되지 않았다고 표시됨) 다른 것을 고르세요. macOS에서 다른 앱도 ⌃⌥G를 쓴다면 둘 중 하나의 단축키를 바꾸세요.</li>
</ul>
<p>다른 오류(모델을 내려받지 않음, 체험 종료, 키 잠김)는 입력 상자에 앱의 해당 화면을 여는 버튼과 함께 나타납니다. <a href="/ko/guide/troubleshooting/">문제 해결</a>도 참고하세요.</p>

<h2 id="privacy">입력한 텍스트는 어디로 가나요?</h2>
<p>아무 데도 가지 않습니다. 입력한 텍스트와 그 번역은 컴퓨터에 있는 AI Translator의 메모리에만 있습니다. 네트워크로 보내지 않고, 디스크에 쓰지 않으며, 로그나 오류 보고서에도 들어가지 않습니다. 앱은 붙여 넣기 위해 번역을 클립보드에 <strong>쓰기만</strong> 하며, 클립보드나 다른 앱의 텍스트를 읽지 않습니다. <a href="/ko/data-security/">데이터와 보안</a>을 참고하세요.</p>
`,
})}
${docNav(
  [
    { href: "/ko/guide/subtitle-bar-and-shortcuts/", kicker: "이전", title: "자막 바와 단축키" },
    { href: "/ko/guide/glossary/", kicker: "다음", title: "용어집 쓰기" },
  ],
  "관련 가이드",
)}
</div></section>
`,
};
