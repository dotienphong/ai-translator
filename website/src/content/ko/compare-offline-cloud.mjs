import { pageHero, ctaBand, callout, faq, docLayout } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

// /compare/ 목록 페이지가 없으므로 이동 경로는 2단계입니다(중간 링크가 깨지기 때문).
const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "오프라인 번역과 클라우드 번역", path: "/ko/compare/offline-vs-cloud-translation/" },
];

export const COMPARE_FAQ = [
  {
    q: "오프라인 번역은 클라우드 번역만큼 정확한가요?",
    a: "<p>둘을 직접 비교한 측정이 없어 결론을 내리지 않습니다. 품질은 모델, 언어 조합, 오디오가 얼마나 또렷한지에 따라 달라집니다. 저희 내부 테스트는 오픈 소스 모델끼리만 비교했으며, 클라우드 서비스와는 비교하지 않았습니다.</p>",
  },
  {
    q: "오프라인 번역은 정말 인터넷이 필요 없나요?",
    a: "<p>번역하는 동안에는 필요 없습니다. 처음 모델을 내려받을 때, 체험을 시작할 때, 요금제를 구매할 때, 라이선스를 확인할 때(유료 요금제는 확인과 확인 사이에 최대 14일 동안 오프라인으로 쓸 수 있음), 앱을 업데이트할 때는 연결이 필요합니다.</p>",
  },
  {
    q: "오프라인 번역은 민감한 회의에 적합한가요?",
    a: "<p>오디오가 컴퓨터 밖으로 나가지 않으므로 제3자가 처리하지 않습니다. 다만 전체적인 안전은 사용하는 기기와 조직의 규정에도 달려 있으니 보안 담당 부서에 확인하세요. 앱은 회의를 녹음하지 않으며, 대본 기록은 기본적으로 꺼져 있습니다.</p>",
  },
  {
    q: "오프라인 번역에는 어떤 컴퓨터가 필요한가요?",
    a: "<p>RAM 최소 8GB(16GB 권장), macOS 14.2 이상의 Apple 실리콘 Mac, 그리고 모델용 디스크 공간 약 1.3GB(Lite 팩) 또는 2.5GB(Standard 팩)가 필요합니다. Windows 버전은 AVX2를 지원하는 CPU가 있는 Windows 10/11 64비트(x64)가 필요합니다. Intel Mac과 Windows ARM64는 지원하지 않습니다.</p>",
  },
  {
    q: "오프라인 번역으로 제 목소리를 상대방을 위해 번역할 수 있나요?",
    a: "<p>아직은 안 됩니다. AI Translator의 자막은 한 방향으로, 컴퓨터에서 재생되는 오디오를 사용자의 언어로 번역합니다. 사용자의 목소리를 번역해 다른 사람에게 들려주지는 않습니다. 글로 답하려면 <a href=\"/ko/guide/type-and-translate/\">입력 번역</a>을 쓰세요. 자신의 언어로 입력하면 앱이 번역을 채팅 창에 붙여 넣으며, 이것도 컴퓨터에서 처리됩니다.</p>",
  },
];

const toc = [
  { level: 2, id: "comparison-table", text: "비교표" },
  { level: 2, id: "privacy", text: "개인정보" },
  { level: 2, id: "internet-and-bots", text: "인터넷과 봇" },
  { level: 2, id: "cost", text: "비용" },
  { level: 2, id: "latency-hardware-languages", text: "지연, 하드웨어, 언어" },
  { level: 2, id: "updates-integration", text: "업데이트와 통합" },
  { level: 2, id: "which-to-choose", text: "무엇을 고를까" },
  { level: 2, id: "faq", text: "자주 묻는 질문" },
];

export default {
  id: "compare-offline-cloud",
  lang: "ko",
  path: "/ko/compare/offline-vs-cloud-translation/",
  title: "오프라인 번역과 클라우드 번역의 차이",
  description:
    "회의용 오프라인 번역과 클라우드 번역을 균형 있게 비교합니다: 개인정보, 인터넷, 봇, 비용, 지연, 하드웨어, 언어, 그리고 언제 무엇을 고를지.",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  schema: [faqPage(COMPARE_FAQ.map((f) => ({ q: f.q, a: f.a })))],
  body: () => `
${pageHero({
  crumbs,
  title: "오프라인 번역과 클라우드 번역은 무엇이 다른가요?",
  lead: "클라우드 번역은 오디오를 제공업체의 서버로 보내 처리하고, 오프라인 번역은 AI Translator처럼 사용자의 컴퓨터에서 처리합니다. 오프라인은 오디오가 기기에 남고, 연결이 없어도 계속 작동하며, 봇도 필요 없지만, 성능이 충분한 컴퓨터가 필요하고 현재 5개 언어를 지원합니다. 클라우드는 기기 부담이 적고, 보통 더 많은 언어를 지원하며, 회의 플랫폼에 내장될 수 있지만, 오디오가 컴퓨터 밖으로 나가야 합니다.",
  meta: "<span>업데이트 {{updated}}</span>",
})}

<section class="section"><div class="container">
${docLayout({
  toc,
  tocTitle: "이 페이지의 내용",
  body: `
<h2 id="comparison-table">비교표</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">기준</th><th scope="col">클라우드 번역</th><th scope="col">오프라인 번역(AI Translator)</th></tr></thead>
<tbody>
<tr><th scope="row">AI 모델이 실행되는 곳</th><td>제공업체의 클라우드</td><td>사용자의 컴퓨터</td></tr>
<tr><th scope="row">오디오를 처리하는 곳</th><td>제공업체의 서버</td><td>사용자의 컴퓨터</td></tr>
<tr><th scope="row">오디오가 기기 밖으로 나가나요?</th><td>예</td><td>아니요, 메모리에 머뭅니다</td></tr>
<tr><th scope="row">번역 중 인터넷 필요</th><td>예</td><td>아니요</td></tr>
<tr><th scope="row">봇이나 플러그인</th><td>내장 기능은 필요 없음. 타사 도구는 필요할 수 있음</td><td>필요 없음. 소리가 나는 모든 앱에서 작동</td></tr>
<tr><th scope="row">1분 더 쓸 때의 비용</th><td>제공업체의 서버 자원을 씀</td><td>제공업체의 인프라를 쓰지 않고, 사용자의 기기를 씀</td></tr>
<tr><th scope="row">지연</th><td>연결과 서버 부하에 따라 다름</td><td>하드웨어에 따라 다름</td></tr>
<tr><th scope="row">언어 수</th><td>보통 더 많음</td><td>5개 언어</td></tr>
<tr><th scope="row">컴퓨터 요구 사항</th><td>낮음</td><td>RAM 8GB부터, 모델 다운로드 1.3~2.5GB</td></tr>
<tr><th scope="row">모델 업데이트</th><td>제공업체가 업데이트하며 바로 반영됨</td><td>새 모델을 직접 내려받음. 앱이 먼저 묻습니다</td></tr>
<tr><th scope="row">통합</th><td>회의 플랫폼에 내장</td><td>자체 자막 바가 있는 별도의 앱</td></tr>
</tbody></table></div>

<h2 id="privacy">개인정보와 처리 위치</h2>
<p>클라우드 번역에서는 오디오가 제공업체의 서버로 전송됩니다. 많은 제공업체가 계약과 보안 인증을 갖추고 있으므로 클라우드가 당연히 덜 안전한 것은 아니지만, 그들의 정책을 신뢰하고 조직의 규정과 견주어 판단해야 합니다.</p>
<p>AI Translator에서는 음성 인식과 번역이 사용자의 기기에서 실행됩니다. 오디오는 메모리에 머물고, 디스크에 쓰이지 않으며, 어디로도 전송되지 않습니다. macOS에서 프록시로 확인한 결과, 번역하는 동안 오디오나 받아쓰기 텍스트가 컴퓨터 밖으로 나가지 않았습니다. <a href="/ko/data-security/">데이터와 보안</a>을 참고하세요.</p>

<h2 id="internet-and-bots">인터넷, 봇, 회의 주최자</h2>
<p>클라우드 번역은 회의하는 동안 안정적인 연결이 필요합니다. AI Translator는 연결이 불안정하거나 끊겨도 번역을 계속합니다. 인터넷은 모델 다운로드, 체험 시작, 활성화, 요금제 구매, 라이선스 확인(유료 요금제는 최소 14일에 한 번 확인 필요), 업데이트할 때만 필요하므로, 인터넷과 완전히 분리된 네트워크에는 맞지 않습니다.</p>
<p>내장 자막은 주최자나 관리자가 켜야 할 수 있고, 타사 도구는 봇이 회의실에 들어와야 할 수 있습니다. AI Translator는 사용자 쪽에서 실행되므로 아무도 따로 할 일이 없습니다. 대신 다른 참석자에게는 알림이 가지 않습니다. 규정상 필요하다면 직접 알리세요(<a href="/ko/solutions/online-meeting-translation/">온라인 회의 솔루션</a> 참고).</p>

<h2 id="cost">비용과 번역 시간</h2>
<p>클라우드에서는 번역 1분마다 제공업체의 서버 자원이 쓰입니다. 대형 회의 플랫폼에 내장된 번역 자막은 보통 상위 유료 요금제에서만 제공됩니다. 오프라인 번역은 계산이 사용자의 기기에서 이루어지므로, 1분을 더 써도 저희 인프라 비용은 늘지 않습니다. AI Translator의 번역 시간 한도(체험 기간에는 하루 30분, Monthly는 30일마다 50시간, 6 Months는 30일마다 100시간, Yearly는 무제한)는 요금 정책이며, 기술적인 한계가 아닙니다.</p>
<p>비용은 사용자의 기기로 옮겨 갑니다: RAM, 디스크, 전력(배터리 사용량은 측정하지 않았습니다). <a href="/ko/pricing/">요금</a>을 참고하세요.</p>

<h2 id="latency-hardware-languages">지연, 하드웨어 요구 사항, 언어</h2>
<p>클라우드는 무거운 작업을 서버에 맡기므로 성능이 낮은 기기에서도 실행되지만, 지연은 연결에도 좌우됩니다. 오프라인 번역에는 성능이 충분한 컴퓨터가 필요합니다. AI Translator에는 RAM 최소 8GB(16GB 권장), macOS 14.2 이상의 Apple 실리콘 Mac(또는 AVX2 지원 CPU가 있는 Windows 10/11 64비트), 그리고 한 번만 받는 모델 다운로드 1.3GB(Lite) 또는 2.5GB(Standard)가 필요합니다.</p>
<p>Mac M4 Pro에서 Standard 팩의 지연 중앙값은 0.76~1.03초입니다. 성능이 낮은 기기에서는 지연이 더 커집니다. M1 Mac에서는 측정하지 않았습니다. 클라우드 서비스는 보통 AI Translator의 5개 언어(영어, 중국어, 일본어, 한국어, 베트남어)보다 많은 언어를 지원합니다. 공통된 측정이 없으므로 번역 품질은 비교하지 않습니다.</p>

<h2 id="updates-integration">모델 업데이트와 통합</h2>
<p>클라우드 서비스는 제공업체가 서버에서 업데이트하므로, 아무것도 하지 않아도 개선 사항이 반영됩니다. 오프라인 모델은 새 모델을 내려받기 전까지 기기에서 그대로 유지되며, 앱은 내려받기 전에 먼저 묻습니다.</p>
<p>통합 면에서는, 모두가 같은 플랫폼을 쓰고 요금제에 이미 그 기능이 포함되어 있다면 회의 플랫폼에 내장된 번역 자막이 더 편리합니다. 따로 설치할 것도, 창을 배치할 일도 없습니다. AI Translator는 자체 자막 바가 있는 별도의 앱이지만, 그 대신 어떤 회의 앱, 웨비나, 동영상에서도 쓸 수 있습니다.</p>

<h2 id="which-to-choose">무엇을 골라야 할까요?</h2>
<h3>클라우드가 더 맞는 경우</h3>
<ul>
<li>AI Translator의 5개 언어 외의 언어가 필요할 때</li>
<li>컴퓨터 성능이 낮거나 RAM이 8GB 미만이거나, 모델을 내려받고 싶지 않을 때</li>
<li>회의 플랫폼 요금제에 번역 자막이 이미 포함되어 있고 모두가 그것을 쓸 때</li>
</ul>
<h3>AI Translator(오프라인)가 더 맞는 경우</h3>
<ul>
<li>민감한 내용이나 내부 규정 때문에 오디오가 기기 밖으로 나가면 안 될 때</li>
<li>연결이 불안정하거나 자주 끊길 때(라이선스 확인을 위해 가끔은 인터넷이 필요합니다)</li>
<li>여러 다른 앱으로 회의하거나, 웨비나와 동영상을 볼 때</li>
<li>플랫폼 요금제에 번역 자막이 없고, 회의실에 봇을 들이고 싶지 않을 때</li>
</ul>
${callout({ title: "둘 중 하나만 고를 필요는 없습니다.", text: "내장 자막이 있는 곳에서는 그것을 쓰고, 다른 회의와 동영상에서는 AI Translator를 쓸 수 있습니다. <a href=\"/ko/features/\">기능</a>과 <a href=\"/ko/guide/quick-start/\">빠른 시작 가이드</a>를 참고하세요." })}

<h2 id="faq">자주 묻는 질문</h2>
${faq(COMPARE_FAQ)}
`,
})}
</div></section>

${ctaBand({ title: "내 회의에서 오프라인 번역을 써 보세요", text: "10일 무료 체험으로 시작하세요. 하루 30분, 카드도 계정도 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/data-security/", label: "데이터 처리 방식" } })}
`,
};
