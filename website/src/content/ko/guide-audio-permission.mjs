import { pageHero, appShot, facts, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "가이드", path: "/ko/guide/" },
  { name: "오디오 권한", path: "/ko/guide/macos-audio-permission/" },
];

const toc = [
  { level: 2, id: "which-permission", text: "앱에 어떤 권한이 필요한가요?" },
  { level: 2, id: "permission-prompt", text: "macOS의 권한 요청" },
  { level: 2, id: "if-you-refused", text: "거부했다면" },
  { level: 2, id: "signs-of-missing-permission", text: "권한이 없을 때의 신호" },
  { level: 2, id: "why-no-error", text: "macOS가 오류를 보여 주지 않는 이유" },
  { level: 2, id: "after-updates", text: "업데이트할 때마다" },
  { level: 2, id: "microphone-permission", text: "마이크 권한" },
  { level: 2, id: "audio-source", text: "오디오 소스 고르기" },
];

const HOWTO_STEPS = [
  { name: "시스템 설정 열기", text: "AI Translator에서 ‘시스템 설정 열기’를 누르거나, 직접 시스템 설정을 열고 ‘개인정보 보호 및 보안’을 고릅니다." },
  { name: "‘화면 및 시스템 오디오 녹음’ 열기", text: "‘개인정보 보호 및 보안’에서 ‘화면 및 시스템 오디오 녹음’을 고릅니다." },
  { name: "AI Translator 켜기", text: "‘시스템 오디오 녹음만’ 아래에서 AI Translator를 켭니다." },
  { name: "다시 해 보기", text: "필요하면 AI Translator를 다시 열고, ‘시작’을 누른 뒤 소리를 재생해 자막이 나타나는지 확인합니다." },
];

export default {
  id: "guide-audio-permission",
  lang: "ko",
  path: "/ko/guide/macos-audio-permission/",
  title: "macOS 시스템 오디오 녹음 권한 허용",
  description:
    "macOS에서 AI Translator에 시스템 오디오 녹음 권한을 허용하는 방법: 요청에 답하기, 시스템 설정에서 다시 켜기, 권한이 없을 때의 신호, 오디오 소스 고르기.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-24",
  schema: [
    howTo({
      name: "AI Translator의 시스템 오디오 녹음 다시 켜기",
      description: "macOS의 요청을 거부한 뒤, 시스템 설정에서 AI Translator의 시스템 오디오 녹음 권한을 켜는 방법.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "macOS에서 시스템 오디오 녹음 권한 허용하기",
  lead: "컴퓨터 오디오를 번역하기 위해 AI Translator에 필요한 macOS 권한은 Mac에서 재생 중인 오디오를 듣기 위한 시스템 오디오 녹음입니다. 마이크가 들어간 입력 소스를 고르면 macOS가 마이크 권한도 묻습니다. 실수로 거부했다면 ‘시스템 설정 › 개인정보 보호 및 보안 › 화면 및 시스템 오디오 녹음’에서 다시 켜세요.",
  meta: "<span>macOS 14.2 이상만 해당</span> <span>업데이트 {{updated}}</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "이 가이드의 내용",
  body: `
<h2 id="which-permission">앱에 어떤 권한이 필요한가요?</h2>
<p>AI Translator는 컴퓨터에서 재생되는 오디오(회의 소리, 동영상, 웨비나)를 캡처해 인식하고 번역합니다. 그래서 macOS는 <strong>시스템 오디오 녹음</strong> 권한을 요구합니다. 기본 입력 소스(<strong>컴퓨터 오디오</strong>)에서는 마이크를 열지 않습니다. <strong>마이크</strong>나 <strong>컴퓨터 오디오 + 마이크</strong>를 고를 때만 마이크를 엽니다(<a href="#microphone-permission">마이크 권한</a> 참조). 회의를 디스크에 저장하지 않으며, 오디오는 번역하는 동안 메모리에만 머뭅니다. Windows에는 시스템 오디오 권한 단계가 없습니다.</p>
${facts([
  ["권한", "시스템 오디오 녹음"],
  ["다시 켜는 곳", "시스템 설정 › 개인정보 보호 및 보안 › 화면 및 시스템 오디오 녹음 › 시스템 오디오 녹음만"],
  ["macOS가 묻는 때", "AI Translator가 처음 오디오를 캡처할 때: ‘사용해 보기’ 단계 또는 처음 ‘시작’을 누를 때"],
])}

<h2 id="permission-prompt">macOS의 권한 요청</h2>
<p>AI Translator가 처음 오디오를 캡처할 때, macOS는 저희가 쓴 설명과 함께 Mac의 언어로 권한 요청을 보여 줍니다. 한국어로는 다음과 같습니다:</p>
<blockquote>AI Translator는 번역 자막을 표시하기 위해 Mac에서 재생 중인 오디오를 수집합니다. 오디오는 Mac 밖으로 전송되지 않습니다.</blockquote>
<p>허용하세요. 앱은 초기 설정의 9단계 중 5단계에서도 이를 알려 드립니다(<a href="/ko/guide/quick-start/">빠른 시작 가이드</a> 참고).</p>
${appShot({ slug: "app-onboarding-5", lang: "ko", alt: "설정 마법사의 시스템 오디오 녹음 허용 단계와 시스템 설정 열기 버튼", caption: "9단계 중 5단계: 앱이 권한을 설명하고 시스템 설정 열기 버튼을 보여 줍니다." })}

<h2 id="if-you-refused">거부했다면: 시스템 설정에서 다시 켜기</h2>
<ol>
<li>AI Translator에서 <strong>시스템 설정 열기</strong>를 누릅니다(초기 설정의 5단계와, 앱이 권한이 없다고 알릴 때 홈 화면에 있습니다). 또는 직접 시스템 설정을 엽니다.</li>
<li><strong>개인정보 보호 및 보안</strong>을 고른 뒤 <strong>화면 및 시스템 오디오 녹음</strong>을 고릅니다.</li>
<li><strong>시스템 오디오 녹음만</strong>을 찾아 <strong>AI Translator</strong>를 켭니다.</li>
<li>앱으로 돌아가 <strong>시작</strong>을 누르고 소리가 나는 것을 재생합니다.</li>
</ol>
<p>그래도 자막이 나오지 않으면 AI Translator를 완전히 종료하고(메뉴 막대 아이콘에서 <strong>종료</strong>) 다시 여세요. 목록에 아직 AI Translator가 없다면, 앱으로 돌아가 ‘시작’을 한 번 눌러(설정 마법사 중이라면 ‘샘플 문장 재생’) macOS가 권한을 묻게 하세요. 보통 그 뒤에 목록에 나타나니 다시 확인하면 됩니다. 시스템 설정의 항목 이름은 macOS 버전에 따라 조금 다를 수 있습니다.</p>

<h2 id="signs-of-missing-permission">권한이 없을 때의 신호</h2>
<p>권한이 없으면 회의 소리가 나도 자막이 나오지 않고, 홈 화면의 ‘입력 레벨’ 막대도 움직이지 않습니다. 다른 앱에서 소리가 나는 것이 확실한데도 한동안 조용하면 <strong>홈 화면</strong>에 다음과 같이 표시됩니다:</p>
<blockquote>앱에서 소리가 나는데도 아무것도 들리지 않습니다. AI Translator가 시스템 오디오를 녹음하도록 허용되지 않았을 수 있습니다.</blockquote>
<p>여기에는 <strong>시스템 설정 열기</strong> 버튼이 함께 있습니다. 권한이 없어 세션이 멈추면 홈 화면에 ‘AI Translator가 시스템 오디오를 녹음하도록 허용되지 않았습니다.’가 같은 버튼과 함께 표시됩니다. 자막 바에 나오는 일반 안내 ‘소리가 들리지 않습니다. 회의 소리가 재생되고 있는지 확인하세요.’와 헷갈리지 마세요. 이것은 한동안 소리가 없었다는 뜻일 뿐이며, 그냥 조용한 회의일 수도 있습니다.</p>

<h2 id="why-no-error">거부해도 macOS가 오류를 보여 주지 않는 이유</h2>
<p>권한이 거부되어도 macOS는 앱이 캡처 소스를 만들도록 허락하고 실행 중이라고 보고하지만, 전달하는 샘플은 모두 무음입니다. 보고할 오류가 없으므로, AI Translator는 다른 앱에서 소리가 나는 동안 긴 무음이 이어지기를 기다려야만 권한이 없다는 것을 알아챌 수 있습니다. 그래서 경고가 바로가 아니라 잠시 뒤에 나타납니다.</p>

<h2 id="after-updates">업데이트할 때마다 macOS가 다시 물을 수 있습니다</h2>
<p>현재 macOS 빌드는 애드혹 서명이므로, 업데이트할 때마다 macOS가 이 녹음 권한을 한 번 더 물을 수 있습니다(키체인 대화상자 1개와 함께). 허용하세요. 데이터, 요금제, 번역 시간을 잃지 않습니다. 자세한 내용은 <a href="/ko/guide/install-macos/">macOS 설치 가이드</a>에 있습니다.</p>

<h2 id="microphone-permission">마이크 권한(마이크가 들어간 입력 소스를 고를 때)</h2>
<p><strong>설정 › 오디오 › 입력 소스</strong>에서 <strong>마이크</strong>나 <strong>컴퓨터 오디오 + 마이크</strong>를 고르면, macOS가 바로 또는 처음 ‘시작’을 누를 때 <strong>마이크</strong> 권한을 묻습니다. 허용하세요.</p>
<ul>
<li><strong>거부했다면:</strong> 입력 소스가 ‘마이크’면 세션이 시작되지 않고, ‘컴퓨터 오디오 + 마이크’면 앱이 컴퓨터 오디오는 계속 번역하면서 “마이크 권한 없음”을 표시합니다. <strong>마이크 설정 열기</strong>(시스템 설정 › 개인정보 보호 및 보안 › 마이크)를 눌러 AI Translator를 켜고, macOS가 물으면 <strong>종료 후 다시 열기</strong>를 고르세요. 새 권한은 앱을 다시 연 뒤에 적용됩니다.</li>
<li><strong>업데이트할 때마다</strong> macOS가 시스템 오디오 녹음처럼 마이크 권한을 다시 물을 수 있습니다(<a href="#after-updates">위 참조</a>).</li>
<li><strong>회의 앱에서 내 마이크를 음소거해도 AI Translator는 계속 듣습니다:</strong> 세션이 진행되는 동안 앱은 마이크를 계속 캡처합니다. 앱이 마이크를 쓰는 동안 macOS는 메뉴 막대에 주황색 점을 표시합니다. 앱이 마이크를 그만 듣게 하려면 ‘중지’를 누르세요.</li>
<li><strong>Windows:</strong> 개인 정보 설정에서 마이크가 막혀 있다면 설정 › 개인 정보 및 보안 › 마이크를 열고 <em>마이크 액세스</em>와 <em>데스크톱 앱에서 마이크에 액세스하도록 허용</em>을 켜세요.</li>
</ul>

<h2 id="audio-source">오디오 소스 고르기: 시스템 전체 또는 앱 하나</h2>
<p>이 권한으로 두 모드를 모두 쓸 수 있습니다. 모드는 <strong>설정 › 오디오 › 오디오 소스</strong>에서 고릅니다:</p>
<ul>
<li><strong>시스템 전체(이 앱 제외)</strong>(기본값): 알림음을 포함해 Mac이 재생하는 모든 것을 번역합니다.</li>
<li><strong>‘{앱 이름}만’</strong>: 회의 앱을 고릅니다. 알림 같은 다른 소리는 번역되지 않습니다. Safari와 다른 앱 안의 웹 페이지는 ‘Safari 및 다른 앱 안의 웹 페이지’로 묶여 표시됩니다.</li>
</ul>
<p>목록에는 <em>지금 소리를 내고 있는</em> 앱만 보입니다. 회의가 시작된 뒤 <strong>목록 새로 고침</strong>을 누르세요. 새 소스는 다음 세션부터 적용됩니다. 고른 앱에서 소리가 멈추면 앱에 ‘선택한 앱에서 소리가 나지 않습니다’라고 표시되고, 다시 소리가 나면 바로 이어서 번역합니다.</p>
${appShot({ slug: "app-settings-audio", lang: "ko", alt: "오디오 설정: 입력 소스는 ‘컴퓨터 오디오 + 마이크’, 오디오 소스(Zoom만), 마이크 선택, 마이크 소리를 낮춘다는 안내, ‘마이크 잡음 필터’ 스위치, 100 ms로 설정된 문장을 끝내는 정지 시간 슬라이더", caption: "설정 › 오디오: 소스와 문장 끊기 민감도." })}

${docNav(
  [
    { href: "/ko/guide/install-macos/", kicker: "이전", title: "macOS에 AI Translator 설치하기" },
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
