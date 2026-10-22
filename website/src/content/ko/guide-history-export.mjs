import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "가이드", path: "/ko/guide/" },
  { name: "기록과 대본 내보내기", path: "/ko/guide/history-and-export/" },
];

const toc = [
  { level: 2, id: "transcript", text: "대본 보기, 검색, 복사" },
  { level: 2, id: "save-history", text: "기록 켜기" },
  { level: 2, id: "export", text: "TXT, SRT, Markdown으로 내보내기" },
  { level: 2, id: "delete-data", text: "세션과 데이터 삭제" },
];

export default {
  id: "guide-history-export",
  lang: "ko",
  path: "/ko/guide/history-and-export/",
  title: "대본 기록과 TXT·SRT 내보내기",
  description:
    "대본 보기·검색·복사는 모든 요금제에서, 암호화된 기록과 TXT·SRT·Markdown 내보내기는 Pro에서 쓸 수 있습니다. SRT 시간 계산 방식과 데이터 삭제 방법도 안내합니다.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "AI Translator에서 기록을 켜고 대본 내보내기",
      description: "기록을 켜고 세션을 번역한 뒤, 그 대본을 TXT, SRT, Markdown으로 내보냅니다.",
      totalTime: "PT5M",
      steps: [
        { name: "기록 켜기", text: "‘설정 › 개인정보 보호’를 열고 ‘대본 기록 저장’을 켭니다. 유료 요금제(Monthly, 6 Months, Yearly)가 필요합니다." },
        { name: "세션을 번역하고 ‘중지’ 누르기", text: "‘중지’를 누르면 앱이 세션의 대본을 컴퓨터의 기록에 암호화해 저장합니다." },
        { name: "대본 열기", text: "‘대본’을 열거나, ‘기록’에서 저장된 세션을 ‘열기’ 버튼으로 엽니다." },
        { name: "형식을 골라 내보내기", text: "‘내보내기 형식’에서 TXT, SRT, Markdown 중 하나를 고르고(SRT는 ‘번역’ 또는 ‘원문’ 선택), ‘내보내기…’를 눌러 저장할 곳을 고릅니다." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "기록과 대본 내보내기",
  lead: "AI Translator의 대본에는 세션의 모든 문장에 대해 시간, 원문, 번역이 나열됩니다. 모든 요금제에서 보고, 검색하고, 복사할 수 있습니다. 세션 기록 저장(내 컴퓨터에 암호화해 저장)과 TXT, SRT, Markdown으로 내보내기는 Pro 기능이며, 기록 저장은 기본적으로 꺼져 있습니다.",
  meta: `<span><span class="badge badge-pro">Pro</span> 내보내기와 기록</span><span>업데이트 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "이 페이지의 내용",
  body: `
${facts([
  ["모든 요금제", "세션 대본 보기, 검색, 복사"],
  ["Pro", "기록 저장, 지난 세션 다시 열기, TXT·SRT·Markdown으로 내보내기"],
  ["기록 저장", "기본값 꺼짐<small>‘설정 › 개인정보 보호’에서 켭니다</small>"],
  ["저장 위치", "내 컴퓨터, 암호화해 저장<small>키는 키체인(macOS) 또는 자격 증명 관리자(Windows)에 있습니다</small>"],
])}

<h2 id="transcript">대본 보기, 검색, 복사</h2>
<p>사이드바에서 <strong>대본</strong>을 열거나, 홈 화면에서 <strong>대본 열기</strong>를 누릅니다. 줄마다 시간, 원문, 번역이 있습니다. 건너뛴 구간은 ‘[구간 건너뜀]’으로 표시되고, 번역하지 못한 문장에는 ‘번역 안 됨’ 표시가 붙습니다.</p>
<ul>
<li><strong>검색:</strong> 위쪽의 돋보기 아이콘이 있는 검색창(안내 문구 ‘원문 또는 번역의 단어’)에 입력합니다. <strong>모두 복사</strong>는 같은 줄 오른쪽에 있습니다. 일치하는 것이 없으면 ‘검색어와 일치하는 문장이 없습니다.’라고 표시됩니다.</li>
<li><strong>모두 복사:</strong> 대본 전체를 일반 텍스트로(아래 TXT 내보내기와 같은 배치로) 클립보드에 넣고 ‘클립보드에 복사했습니다.’라고 표시합니다.</li>
</ul>
${callout({
  kind: "warn",
  title: "대본에는 가장 최근 세션만 남습니다.",
  text: "대본은 앱의 메모리에 있으며, 새 세션을 시작하면 이전 세션이 대체됩니다. 남겨 두려면 다음 세션을 시작하기 전에 복사하거나, 내보내거나, 기록을 켜세요. 자막 바에는 최근 1000문장만 남지만, 대본에는 세션의 모든 문장이 남습니다.",
})}
${appShot({
  slug: "app-transcript",
  lang: "ko",
  alt: "대본 화면: 돋보기 아이콘이 있는 검색창, 모두 복사 버튼, 내보내기 형식 선택, 시간·원문·번역이 있는 줄 목록",
  caption: "대본: 검색, 복사, 내보내기 형식 고르기.",
})}

<h2 id="save-history">기록 켜기(Pro)</h2>
<ol>
<li><strong>설정 › 개인정보 보호</strong>를 엽니다.</li>
<li><strong>대본 기록 저장</strong>을 켭니다. Free 체험에서는 스위치가 잠겨 있고 ‘기록 저장은 Pro 기능입니다.’라고 표시됩니다.</li>
<li>평소처럼 번역한 뒤 <strong>중지</strong>를 누릅니다. 앱이 세션의 대본을 저장합니다. 문장이 하나도 없는 세션은 저장되지 않습니다. 세션 도중에 앱을 종료하거나 컴퓨터를 끄거나 로그아웃해도 ‘중지’를 누른 것처럼 저장되지만, 갑자기 끝나면(강제 종료, 전원 꺼짐) 그 세션은 사라집니다.</li>
<li>사이드바에서 <strong>기록</strong>을 엽니다.</li>
</ol>
${appShot({
  slug: "app-settings-privacy",
  lang: "ko",
  alt: "개인정보 설정: 대본 기록 저장 스위치(꺼짐), 오류 보고서 자동 전송 스위치(켜짐), 모든 데이터 삭제 버튼, 모델 및 데이터 삭제 버튼",
  caption: "설정 › 개인정보 보호: 기록 켜기와 데이터 삭제.",
})}
<p><strong>기록</strong>의 각 세션에는 날짜와 시간, 길이와 문장 수(‘47분 · 186문장’), 미리보기, <strong>열기</strong>와 <strong>삭제</strong> 버튼이 최신순으로 표시됩니다. <strong>열기</strong>를 누르면 대본에서처럼 보고, 검색하고, 복사하고, 내보낼 수 있으며, <strong>목록으로 돌아가기</strong>로 돌아옵니다. 저장이 꺼져 있으면 화면에 ‘기록 저장이 꺼져 있어 새 세션이 저장되지 않습니다.’라고 표시됩니다.</p>
${appShot({
  slug: "app-history",
  lang: "ko",
  alt: "기록 화면: 날짜와 시간, 길이, 문장 수, 미리보기, 열기와 삭제 버튼이 있는 저장된 세션",
  caption: "기록: 내 컴퓨터에 저장된 세션.",
})}
<p>기록과 용어집은 내 컴퓨터에만 있는 암호화된 데이터베이스 하나를 함께 씁니다. 키는 앱이 내 기기에서 만든 무작위 값이며, 키체인(macOS)이나 자격 증명 관리자(Windows)에 보관됩니다. 시스템이 접근을 물을 때 거부하면 앱에 ‘기록과 용어집 데이터를 열지 못했습니다. …’라고 표시되니, 허용한 뒤 다시 시도하세요. 자세한 내용은 <a href="/ko/data-security/">데이터와 보안</a>에 있습니다.</p>

<h2 id="export">TXT, SRT, Markdown으로 내보내기(Pro)</h2>
<ol>
<li><strong>대본</strong>을 열거나 <strong>기록</strong>에서 세션을 엽니다.</li>
<li><strong>내보내기 형식</strong>에서 <strong>TXT</strong>, <strong>SRT</strong>, <strong>Markdown</strong> 중 하나를 고릅니다. SRT를 고르면 파일에 넣을 텍스트를 고르는 두 번째 메뉴가 옆에 나타납니다: <strong>번역</strong> 또는 <strong>원문</strong>.</li>
<li><strong>내보내기…</strong>를 누르고 저장할 곳을 고릅니다. 앱은 <code>transcript-2026-10-02-1405.txt</code> 같은 이름(세션을 시작한 날짜와 시간)을 제안합니다. 끝나면 ‘…에 저장했습니다’라고 표시됩니다.</li>
</ol>
<p>Free 체험에서는 <strong>내보내기…</strong> 버튼이 잠겨 있고, ‘파일로 내보내기는 Pro 기능입니다. 복사는 모든 플랜에서 가능합니다.’라는 안내와 <strong>Pro로 업그레이드</strong> 버튼이 표시됩니다.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">형식</th><th scope="col">줄마다의 내용과 시간</th></tr></thead>
<tbody>
<tr><th scope="row">TXT</th><td>문장마다 한 덩어리: <code>[시간] 원문</code>, 다음 줄에 <code>→ 번역</code>, 덩어리 사이에는 빈 줄. 시간은 그 문장이 시작될 때 컴퓨터 시계의 시각(HH:MM:SS)입니다.</td></tr>
<tr><th scope="row">SRT</th><td>번호, ‘시작 --&gt; 끝’, 그리고 텍스트 한 줄(고른 번역 또는 원문). 시간은 세션 시작부터 셉니다(HH:MM:SS,mmm).</td></tr>
<tr><th scope="row">Markdown</th><td>시작 날짜와 시간이 들어간 제목, 그리고 시간·원문·번역의 세 열 표. 시간은 컴퓨터 시계의 시각입니다.</td></tr>
</tbody></table></div>
<h3>동영상에서 SRT 파일 쓰기</h3>
<p>SRT 각 줄의 시간은 세션 시작부터 세므로, 00:00:00은 세션의 시작이지 저절로 동영상의 시작이 되지는 않습니다. AI Translator는 회의를 녹음하지 않아 동영상이 언제 시작했는지 알 수 없습니다. 동영상과 세션이 어긋나면 플레이어나 자막 편집기에서 시간을 옮기세요. ‘번역’ SRT에서는 번역이 없는 문장(이미 내 언어이거나 번역하지 못한 문장)이 원문으로 표시됩니다.</p>

<h2 id="delete-data">세션과 모든 데이터 삭제</h2>
<ul>
<li><strong>삭제</strong>(기록에서): 세션 하나를 지웁니다.</li>
<li><strong>모든 세션 삭제:</strong> 앱이 ‘저장된 세션을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.’라고 물으면 <strong>삭제</strong>를 누릅니다.</li>
<li><strong>모든 데이터 삭제</strong>(설정 › 개인정보 보호, 모든 요금제): 이 컴퓨터에서 저장된 기록과 용어집을 지웁니다. 라이선스, 번역 시간, 설정은 유지됩니다. 앱이 확인을 받은 뒤 ‘기록과 용어집을 삭제했습니다.’라고 표시합니다.</li>
<li><strong>모델 및 데이터 삭제</strong>(같은 화면): 내려받은 모델도 지웁니다. macOS에서는 앱을 지우기 전에 하세요.</li>
</ul>
<p>삭제는 되돌릴 수 없습니다. 이어서 <a href="/ko/guide/glossary/">용어집 가이드</a>나 <a href="/ko/guide/troubleshooting/">문제 해결</a>을 참고하세요.</p>
`,
})}
${docNav(
  [
    { href: "/ko/guide/glossary/", kicker: "이전", title: "용어집 쓰기" },
    { href: "/ko/guide/buy-and-activate/", kicker: "다음", title: "요금제 구매, 키 활성화, 컴퓨터 바꾸기" },
  ],
  "관련 가이드",
)}
</div></section>
`,
};
