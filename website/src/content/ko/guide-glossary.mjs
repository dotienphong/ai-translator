import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "가이드", path: "/ko/guide/" },
  { name: "용어집 쓰기", path: "/ko/guide/glossary/" },
];

const toc = [
  { level: 2, id: "how-it-works", text: "용어집의 작동 방식" },
  { level: 2, id: "add-edit-delete", text: "용어 추가, 편집, 삭제" },
  { level: 2, id: "import-export-csv", text: "CSV 가져오기와 내보내기" },
  { level: 2, id: "writing-tips", text: "좋은 용어 쓰는 법" },
  { level: 2, id: "examples", text: "예" },
];

export default {
  id: "guide-glossary",
  lang: "ko",
  path: "/ko/guide/glossary/",
  title: "용어집: 추가, CSV 가져오기, 작성 요령",
  description:
    "AI Translator 용어집(Pro 기능) 사용법: 용어 추가·편집·삭제, CSV 가져오기와 내보내기, 용어가 번역기에 전달되는 방식, 좋은 용어를 쓰는 요령.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-22",
  schema: [
    howTo({
      name: "AI Translator 용어집에 용어 추가하기",
      description: "용어와 번역을 하나 추가한 뒤, CSV 파일에서 용어를 더 가져옵니다.",
      totalTime: "PT5M",
      steps: [
        { name: "용어집 열기", text: "메인 창 왼쪽 사이드바에서 ‘용어집’을 누릅니다. 용어집에는 유료 요금제(Monthly, 6 Months, Yearly)가 필요합니다." },
        { name: "용어와 번역 입력하기", text: "‘용어’ 칸에 용어를, ‘번역’ 칸에 원하는 번역을 입력합니다. 각 칸은 최대 200자입니다." },
        { name: "‘추가’ 누르기", text: "새 쌍이 목록에 나타납니다. 세션 중이라도 이후 문장에서 바로 쓰입니다." },
        { name: "CSV 파일 가져오기(선택)", text: "‘CSV 가져오기…’를 누르고, 두 열로 된 UTF-8 CSV 파일(최대 1MB)을 고릅니다. 앱이 추가, 업데이트, 건너뜀, 한도 초과된 용어 수를 알려 줍니다." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "용어집 쓰기",
  lead: "AI Translator 용어집에는 이름, 약어, 업계 용어 같은 ‘용어 → 번역’ 쌍을 최대 500개까지 저장할 수 있습니다. 번역 중인 문장에 내 용어가 들어 있으면, 앱이 그 쌍을 힌트로 번역기에 넘깁니다. 용어집은 Pro 기능이며 Monthly, 6 Months, Yearly 요금제에 포함됩니다.",
  meta: `<span><span class="badge badge-pro">Pro</span></span><span>업데이트 {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "이 페이지의 내용",
  body: `
${facts([
  ["요금제", "Pro: Monthly, 6 Months, Yearly<small>Free에서는 잠긴 화면이 보입니다</small>"],
  ["용량", "최대 500개 용어<small>각 칸 최대 200자</small>"],
  ["CSV 파일", "두 열, UTF-8<small>최대 1MB</small>"],
  ["번역 중", "문장당 최대 20개 용어"],
  ["일치", "대소문자 구분 없음<small>중국어, 일본어, 한국어 용어는 단어 중간에서도 일치</small>"],
  ["저장 위치", "내 컴퓨터<small>암호화된 데이터베이스에 저장</small>"],
])}

<h2 id="how-it-works">용어집은 어떻게 작동하나요?</h2>
<p>문장이 인식될 때마다 앱은 <strong>원문</strong>(음성 인식이 받아쓴 텍스트)에서 내 용어를 찾고, 찾은 쌍을 그 문장과 함께 번역기에 넘깁니다. 세션 중에 용어집을 고치면 이후 문장에서 바로 새 내용이 쓰입니다.</p>
<ul>
<li><strong>명령이 아니라 힌트입니다.</strong> 앱은 ‘매번 사용되지는 않을 수 있습니다’라고 밝히고 있습니다. 용어집은 올바른 단어가 쓰일 가능성을 높여 주지만 보장하지는 않습니다.</li>
<li><strong>대소문자를 구분하지 않습니다:</strong> ‘api’는 ‘API’와 일치합니다.</li>
<li><strong>라틴 문자 용어는 단어 단위로 일치합니다:</strong> ‘AI’는 ‘AI’s’에는 일치하지만 ‘said’에는 일치하지 않습니다.</li>
<li><strong>중국어, 일본어, 한국어 용어는 단어 중간에서도 일치합니다.</strong> 중국어와 일본어는 단어 사이에 띄어쓰기가 없고, 한국어는 단어에 조사가 붙기 때문입니다.</li>
<li><strong>문장당 최대 20개 용어.</strong> 그보다 많이 일치하면 더 길고 구체적인 용어를 먼저 남깁니다.</li>
</ul>
${callout({
  title: "Free 요금제에서는 용어집을 쓸 수 없습니다.",
  text: "용어집 화면에는 ‘용어집은 Pro 기능입니다. 등록한 용어가 번역할 때 사용됩니다.’라고 적힌 잠긴 패널과 <strong>Pro로 업그레이드</strong> 버튼이 보입니다. 요금제 구매는 <a href=\"/ko/guide/buy-and-activate/\">요금제 구매, 키 활성화, 컴퓨터 바꾸기</a>를 참고하세요. 가격은 <a href=\"/ko/pricing/\">요금 페이지</a>에 있습니다.",
})}

<h2 id="add-edit-delete">용어 추가, 편집, 삭제</h2>
<ol>
<li>왼쪽 사이드바에서 <strong>용어집</strong>을 누릅니다. 위쪽 안내 아래에 ‘8 / 500개 용어’처럼 등록한 용어 수가 표시됩니다.</li>
<li><strong>용어</strong> 칸에 원래 텍스트를 말하는 사람이 말하는 그대로 입력하고, <strong>번역</strong> 칸에 보고 싶은 번역을 입력합니다. 각 칸은 최대 200자이며, 줄 바꿈이나 탭은 쓸 수 없습니다.</li>
<li><strong>추가</strong>를 누릅니다. 새 쌍이 ‘용어 → 번역’ 형태로 목록에 나타납니다.</li>
<li>쌍을 바꾸려면 <strong>편집</strong>을 누르고 두 칸을 고친 뒤 <strong>저장</strong>(또는 <strong>취소</strong>)을 누릅니다. 지우려면 <strong>삭제</strong>를 누릅니다.</li>
</ol>
<p>오류는 입력 줄 바로 아래에 나타납니다: ‘용어와 번역을 모두 입력하세요.’, ‘200자 이내로 입력하세요.’, ‘이 용어는 이미 용어집에 있습니다.’(중복은 대소문자 구분 없이 판단). 용어집이 500개가 되면 입력 줄이 사라지고 ‘용어집에 이미 500개의 용어가 있습니다. 더 추가하려면 일부를 삭제하세요.’라고 표시됩니다.</p>
${appShot({
  slug: "app-glossary",
  lang: "ko",
  alt: "용어집 화면: 최대 500개 중 용어 수, 용어와 번역 칸, CSV 가져오기와 CSV 내보내기 버튼, 용어와 번역 쌍 목록",
  caption: "유료 요금제(Monthly, 6 Months, Yearly)의 용어집 화면.",
})}

<h2 id="import-export-csv">CSV 가져오기와 내보내기</h2>
<p>가져오기로 긴 목록을 한 번에 불러올 수 있고, 내보내기로 백업이나 스프레드시트에서 고칠 파일을 얻을 수 있습니다. 파일은 다음 조건을 지켜야 합니다.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">조건</th><th scope="col">내용</th></tr></thead>
<tbody>
<tr><th scope="row">열</th><td>1열은 용어, 2열은 번역입니다. 첫 줄의 <code>source,target</code>은 있어도 없어도 되며, 가져올 때 건너뜁니다.</td></tr>
<tr><th scope="row">인코딩</th><td>UTF-8. 스프레드시트가 다른 인코딩으로 저장하면 앱이 파일을 받지 않습니다. Excel에서는 ‘CSV UTF-8’로 저장하세요.</td></tr>
<tr><th scope="row">크기</th><td>최대 1MB.</td></tr>
<tr><th scope="row">각 셀</th><td>최대 200자, 줄 바꿈 없음.</td></tr>
</tbody></table></div>
<p>파일 내용 예:<br><code>source,target</code><br><code>API gateway,API 게이트웨이</code><br><code>burn rate,현금 소진율</code></p>
<ol>
<li><strong>CSV 가져오기…</strong>를 누르고 시스템 대화상자에서 파일을 고릅니다.</li>
<li>결과를 확인합니다: ‘가져오기 결과: …개 추가, …개 업데이트, …행 건너뜀, 500개 한도 초과 …개.’</li>
</ol>
<ul>
<li><strong>추가:</strong> 새 용어.</li>
<li><strong>업데이트:</strong> 이미 용어집에 있는 용어(대소문자 구분 없음). 앱이 파일의 번역을 씁니다.</li>
<li><strong>건너뜀:</strong> 열이 빠진 행, 빈 행, 200자를 넘거나 줄 바꿈이 있는 셀.</li>
<li><strong>500개 한도 초과:</strong> 용어집이 가득 차서 들어가지 못한 올바른 행.</li>
</ul>
<p>파일을 읽지 못하면 앱은 ‘이 CSV 파일을 읽지 못했습니다. 아무것도 가져오지 않았습니다.’라고 표시하고 용어집을 그대로 둡니다. 1MB를 넘는 파일은 ‘이 파일이 너무 큽니다. 용어집 파일은 최대 1 MB입니다.’라며 받지 않습니다.</p>
<p><strong>CSV 내보내기…</strong>를 누르면 용어집 전체를 파일로 저장합니다(용어집이 비어 있으면 버튼을 누를 수 없음). 내보낸 파일은 <code>source,target</code>으로 시작하며, Excel에서 악센트가 있는 글자 등이 제대로 보이도록 UTF-8을 씁니다. <code>=</code>, <code>+</code>, <code>-</code>, <code>@</code>로 시작하는 셀에는 스프레드시트가 수식으로 다루지 않도록 앞에 아포스트로피가 붙으며, 그 파일을 다시 가져오면 앱이 아포스트로피를 지웁니다.</p>

<h2 id="writing-tips">좋은 용어는 어떻게 쓰나요?</h2>
<ul>
<li><strong>이름:</strong> 회사, 제품, 사람, 장소. 보고 싶은 번역을 쓰세요. 이름을 그대로 두어도 됩니다.</li>
<li><strong>약어:</strong> 말하는 사람이 쓰는 형태를 쓰고, 필요하면 설명을 붙이세요: ‘SLA’ → ‘서비스 수준 계약(SLA)’.</li>
<li><strong>업계 용어:</strong> 내 분야에서 번역기가 엉뚱한 뜻으로 옮기기 쉬운 단어.</li>
<li><strong>받아쓰기되는 대로 쓰기.</strong> 짧은 세션을 돌려 <a href="/ko/guide/history-and-export/">대본</a>을 읽어 보세요. 어떤 이름이 늘 다른 철자로 받아쓰기된다면, 그 철자도 용어로 추가할 수 있습니다.</li>
<li><strong>용어 하나에 번역 하나.</strong> 용어집은 언어 쌍에 묶여 있지 않으므로, 번역은 내가 읽는 언어로 쓰세요. 홈 화면에서 번역 언어를 바꿨다면 번역을 다시 살펴보세요.</li>
<li><strong>짧고 구체적으로.</strong> ‘회의’나 ‘프로젝트’처럼 아주 흔한 단어는 피하세요. 많은 문장에 나오지만 고칠 일은 드뭅니다.</li>
</ul>

<h2 id="examples">예</h2>
<p>첫 열은 방향(말하는 사람의 언어 → 내가 읽는 언어)입니다. 모든 쌍을 한 용어집에 넣어 둘 수 있으며, 앱은 그 용어가 번역 중인 문장에 나올 때만 쌍을 씁니다.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">방향</th><th scope="col">용어</th><th scope="col">번역</th></tr></thead>
<tbody>
<tr><td>영어 → 한국어</td><td>API gateway</td><td>API 게이트웨이</td></tr>
<tr><td>영어 → 한국어</td><td>Acme Holdings</td><td>Acme Holdings(이름 그대로)</td></tr>
<tr><td>중국어 → 한국어</td><td>增值税</td><td>부가가치세</td></tr>
<tr><td>일본어 → 한국어</td><td>見積書</td><td>견적서</td></tr>
<tr><td>한국어 → 영어</td><td>검수 보고서</td><td>acceptance report</td></tr>
<tr><td>한국어 → 영어</td><td>부산</td><td>Busan</td></tr>
</tbody></table></div>
<p>번역된 내용을 다시 보려면 <a href="/ko/guide/history-and-export/">대본과 기록</a>을 여세요. 용어집이 기대대로 동작하지 않으면 <a href="/ko/guide/troubleshooting/">문제 해결</a>을 참고하세요.</p>
`,
})}
${docNav(
  [
    { href: "/ko/guide/type-and-translate/", kicker: "이전", title: "입력 번역" },
    { href: "/ko/guide/history-and-export/", kicker: "다음", title: "기록과 대본 내보내기" },
  ],
  "관련 가이드",
)}
</div></section>
`,
};
