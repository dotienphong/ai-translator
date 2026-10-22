import { pageHero, sectionHead, plansGrid, steps, faq, ctaBand, callout, appShot, checkList, icon } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "요금", path: "/ko/pricing/" },
];

export const PRICING_FAQ = [
  {
    q: "Free와 유료 요금제는 무엇이 다른가요?",
    a: `<p>Free는 체험판입니다. 컴퓨터가 처음 등록한 날부터 10일 동안, 하루 최대 30분까지 번역할 수 있으며 컴퓨터마다 한 번만 쓸 수 있습니다. 유료 요금제(Monthly, 6 Months, Yearly)에는 Pro 기능(용어집, 기록, 내보내기)과 더 많은 번역 시간이 더해집니다.</p>`,
  },
  {
    q: "10일 체험이 끝나면 어떻게 되나요?",
    a: `<p>그 컴퓨터는 더 이상 Free 요금제를 쓸 수 없으며, 번역을 계속하려면 Monthly, 6 Months, Yearly 요금제가 필요합니다. 앱을 지웠다가 다시 설치하거나, 데이터를 삭제하거나, 키체인을 비워도 10일이 다시 시작되지 않습니다. 서버가 컴퓨터마다 시작 날짜를 기록하기 때문입니다.</p>`,
  },
  {
    q: "해외 카드로 결제할 수 있나요?",
    a: `<p>네. 앱의 업그레이드 화면에는 결제 방법이 두 가지 있습니다: <strong>VND로 하는 VietQR 계좌 이체</strong>(베트남 은행에서 PayOS 게이트웨이를 통해)와 <strong>USD로 하는 해외 카드 결제</strong>(Monthly US$3.99, 6 Months US$21.99, Yearly US$39.99, 세금 별도)입니다. 카드로 결제하면 앱이 브라우저에서 Creem 결제 페이지를 엽니다. 결제를 마치고 앱으로 돌아오면 요금제가 저절로 활성화됩니다. 카드로 결제한 주문은 Creem이 판매자(merchant of record, 재판매자)로서 결제와 세금을 처리합니다. Creem 구매자 약관: <a href="https://www.creem.io/buyer-terms" rel="noopener">https://www.creem.io/buyer-terms</a>. 정기 결제는 없습니다. Free 체험에는 결제 수단이 필요 없습니다.</p>`,
  },
  {
    q: "요금제가 자동으로 갱신되나요?",
    a: `<p>아니요. 모든 요금제는 한 번만 결제하는 선불 주문이며, 기간이 끝나면 그대로 종료됩니다. 앱이 7일 전에 알려 드리므로 원할 때 갱신하면 됩니다. 같은 요금제를 갱신하면 30일(Monthly), 180일(6 Months), 365일(Yearly)이 추가되며, 요금제가 아직 유효하면 만료일부터 계산합니다.</p>`,
  },
  {
    q: "키 하나를 컴퓨터 몇 대에서 쓸 수 있나요?",
    a: `<p>한 대입니다. 키마다 컴퓨터 한 대에서만 쓸 수 있습니다. 다른 컴퓨터로 옮기려면 이전 컴퓨터의 '설정 › 라이선스'에서 비활성화하거나, 새 컴퓨터에서 '그 컴퓨터를 제거하고 이 컴퓨터 사용'을 고르세요. 키가 다른 컴퓨터에서 쓰이는 동안에는 두 번째 컴퓨터가 기본으로 차단됩니다. 일부러 '그래도 이 컴퓨터에서 활성화'를 고르고 확인한 경우에만, 둘 중 하나가 키를 제거할 때까지 키가 두 컴퓨터 모두에서 일시적으로 잠깁니다.</p>`,
  },
  {
    q: "환불받을 수 있나요?",
    a: `<p>결제 금액은 환불되지 않습니다. 다만 저희 쪽 오류로 구매한 요금제를 쓸 수 없고 합리적인 기간 안에 고칠 수 없는 경우, 또는 법에서 달리 정한 경우는 예외입니다. 결제일로부터 7일 이내에 주문 번호와 함께 support@aitranslator.io.vn으로 먼저 요청해 주세요. 요금제 변경은 환불되지 않습니다. 카드 결제는 Creem이 판매자(merchant of record)이므로 Creem이 Creem의 약관에 따라 환불할 수도 있습니다. 주문이 환불되면(전액이든 일부든, 카드 분쟁을 통한 경우도 포함) 그 주문으로 라이선스에 추가된 기간을 줄이거나, 라이선스가 그 주문만으로 이루어져 있으면 라이선스를 취소할 수 있습니다. 이는 자동이 아니며 운영자가 건별로 판단합니다. 자세한 내용은 <a href="/en/terms/">이용약관(영어)</a>을 참조하세요.</p>`,
  },
  {
    q: "회사용 전자 세금계산서를 받을 수 있나요?",
    a: `<p>VietQR 주문에 대해서는 아직 전자 세금계산서를 발행하지 않습니다. 해외 카드로 결제한 주문은 입력한 이메일 주소로 Creem이 영수증을 보냅니다. 다른 서류가 필요하면 support@aitranslator.io.vn으로 연락해 주시면 함께 방법을 찾아보겠습니다.</p>`,
  },
  {
    q: "번역 시간은 어떻게 계산되나요?",
    a: `<p>번역된 발화만 발화 길이로 계산합니다. 무음, 이미 읽고 싶은 언어로 된 문장, 번역하지 못한 구간은 계산하지 않습니다. 번역 시간은 컴퓨터마다 따로 관리됩니다.</p>`,
  },
  {
    q: "키를 잃어버렸어요. 어떻게 하나요?",
    a: `<p>'설정 › 라이선스 › 키를 잃어버렸나요?'를 열고 구매할 때 쓴 이메일을 입력한 다음 '내 키 보내기'를 고르세요. 그 이메일로 된 유효한 키가 모두 같은 주소로 전송됩니다. support@aitranslator.io.vn으로 연락하셔도 됩니다.</p>`,
  },
];

export default {
  id: "pricing",
  lang: "ko",
  path: "/ko/pricing/",
  title: "요금: 무료 체험과 선불 요금제 3가지",
  description:
    "10일 무료 체험과 Monthly, 6 Months, Yearly 선불 요금제 3가지. 해외 카드(US$3.99부터, 세금 별도) 또는 VietQR로 결제하며 자동 갱신이 없습니다.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  schema: [faqPage(PRICING_FAQ.map((f) => ({ q: f.q, a: f.a })))],
  body: () => `
${pageHero({ crumbs, title: "간단한 요금: 선불, 자동 갱신 없음", lead: "10일 동안 무료로 써 보고, 쓸 만하다면 Monthly, 6 Months, Yearly 중에서 고르세요. 결제는 앱 안에서 시작하며, 베트남 은행에서 베트남 동(VND)으로 VietQR 결제를 하거나 해외 카드로 미국 달러(USD) 결제를 할 수 있습니다. 카드로 결제하면 브라우저에서 결제를 마칩니다. 키는 이메일로 받습니다." })}

<section class="section-tight"><div class="container">
<h2 class="sr-only">요금제 네 가지</h2>
${plansGrid("ko", { ctaLabel: "다운로드", freeLabel: "설치하고 무료로 써 보기" })}
<p class="disclaimer">VND 가격은 주문당 가격이며 VietQR 코드의 금액과 같습니다. USD 가격은 해외 카드로 결제할 때의 가격이며 세금 별도입니다. 거주 국가에서 세금(부가가치세, GST, 판매세)을 부과하면 Creem이 결제 페이지에서 더합니다. 가격과 번역 시간은 서버에서 정하며, 이미 구매한 요금제는 그 주문이 환불되지 않는 한 구매한 기간의 번역 시간을 그대로 유지합니다.</p>
${callout({ title: "베트남 밖에서 결제하기", text: "베트남 은행 계좌가 없으신가요? 업그레이드 화면에서 <strong>카드 결제(USD)</strong>를 고르세요. Creem 결제 페이지에서 카드로 결제하므로 베트남 은행이 필요 없습니다. Creem 목록에 있는 일부 국가에서는 카드를 사용할 수 없습니다. Free 체험에는 여전히 결제 수단이 필요 없습니다. 도움이 필요하면 <a href=\"/ko/contact/\">문의해 주세요</a>." })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "비교", title: "요금제별 포함 내용", center: true })}
<div class="table-wrap reveal" role="region" aria-label="요금제 비교" tabindex="0"><table class="compare">
<thead><tr><th scope="col"><span class="sr-only">기능</span></th><th scope="col">Free(체험)</th><th scope="col">Monthly</th><th scope="col">6 Months</th><th scope="col">Yearly</th></tr></thead>
<tbody>
<tr><th scope="row">가격</th><td>0 ₫</td><td>주문당 50,000 ₫<small>또는 US$3.99(세금 별도)</small></td><td>주문당 269,000 ₫<small>또는 US$21.99(세금 별도)</small></td><td>주문당 500,000 ₫<small>또는 US$39.99(세금 별도)</small></td></tr>
<tr><th scope="row">결제 방법</th><td>결제 필요 없음</td><td>VietQR(VND) 또는 해외 카드(USD)</td><td>VietQR(VND) 또는 해외 카드(USD)</td><td>VietQR(VND) 또는 해외 카드(USD)</td></tr>
<tr><th scope="row">기간</th><td>10일, 컴퓨터당 1회</td><td>주문당 30일</td><td>주문당 180일</td><td>주문당 365일</td></tr>
<tr><th scope="row">번역 시간</th><td>하루 30분</td><td>30일 주기마다 50시간(3,000분)</td><td>30일 주기마다 100시간(6,000분)</td><td>무제한</td></tr>
<tr><th scope="row">실시간 번역 자막, 5개 언어</th><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">맞춤 설정 가능한 자막 바, 단축키</th><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">대본 복사</th><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">채팅용 입력 번역(번역 시간을 쓰지 않음)</th><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">용어집(Pro)</th><td><span class="no">아니요</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">세션 기록(Pro)</th><td><span class="no">아니요</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">TXT, SRT, Markdown으로 내보내기(Pro)</th><td><span class="no">아니요</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td><td><span class="yes">예</span></td></tr>
<tr><th scope="row">키 하나로 쓸 수 있는 컴퓨터</th><td>키 필요 없음</td><td>1대</td><td>1대</td><td>1대</td></tr>
<tr><th scope="row">월 환산</th><td>0 ₫</td><td>50,000 ₫</td><td>약 44,800 ₫</td><td>약 41,700 ₫</td></tr>
</tbody></table></div>
<p class="small muted">Monthly를 6번 이어서 사면(180일) 300,000 ₫이지만, 6 Months 주문 한 번이면 180일에 269,000 ₫입니다. Monthly를 12번 이어서 사면(360일) 600,000 ₫이지만 Yearly 주문 한 번이면 365일에 500,000 ₫입니다. Monthly는 30일마다 50시간, 6 Months는 30일마다 100시간까지 번역할 수 있고 Yearly는 무제한입니다. 각 Pro 기능의 자세한 내용은 <a href="/ko/features/">기능 페이지</a>에 있습니다.</p>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-upgrade", lang: "ko", alt: "한국어 앱의 업그레이드 화면. 카드 결제(USD)가 선택된 상태로, 1단계 결제 방법에는 VietQR 계좌 이체(VND) 옆에 카드 주문은 Creem이 판매자라는 안내, 2단계 플랜 선택에는 Free, Monthly, 6 Months, Yearly 요금제와 번역 시간, 세금 별도 USD 가격($3.99, $21.99, $39.99), 3단계 결제에는 키를 받을 이메일 입력란과 브라우저에서 결제 버튼", caption: "카드를 고른 앱의 업그레이드 화면: 결제 방법 두 가지, 요금제 네 가지, USD 가격(세금 별도)과 번역 시간." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">번역 시간</span>
<h2>번역된 발화만 계산합니다</h2>
${checkList([
  "시간은 번역된 구간의 <strong>발화 길이</strong>로 재며, 앞뒤 여백이나 무음은 계산하지 않습니다",
  "<strong>이미 읽고 싶은 언어</strong>로 된 문장, 건너뛰었거나 번역하지 못한 구간은 <strong>계산하지 않습니다</strong>",
  "<strong>Free:</strong> 30분 한도는 매일 초기화되며, 보통 컴퓨터 시계로 00:00입니다(직전 초기화로부터 최소 20시간 후, 다시 열리는 정확한 시각은 앱에 표시됩니다)",
  "<strong>Monthly와 6 Months:</strong> 30일 주기는 달력의 달이 아니라 결제일부터 시작합니다(6 Months는 180일 안에 주기가 여섯 번 있으며 주기마다 100시간)",
  "남은 시간이 5분 미만이면 앱이 알려 주고, 한도를 다 쓰면 세션을 멈추고 언제 다시 번역할 수 있는지 알려 줍니다",
  "번역 시간은 컴퓨터마다 따로 관리됩니다",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "구매 방법", title: "요금제 선택부터 활성화까지, 앱 안에서", center: true })}
${steps([
  { title: "앱에서 결제 방법과 요금제 고르기", text: "<strong>Pro로 업그레이드</strong>를 열고 <strong>결제 방법</strong>(VND로 VietQR 또는 USD로 해외 카드)을 고른 다음 Monthly, 6 Months, Yearly 중에서 고릅니다(요금제 칸의 가격은 결제 방법에 맞춰 표시됩니다). 키를 받을 이메일을 입력하고, 키를 보내고 되찾을 수 있도록 저장하는 데 동의합니다." },
  { title: "결제하기", text: "<strong>VietQR:</strong> 앱 창에 QR 코드가 바로 나타나고 PayOS 결제 페이지를 여는 버튼도 있습니다. 코드는 15분 동안 유효합니다. <strong>해외 카드:</strong> 앱이 브라우저에서 Creem 결제 페이지를 저절로 엽니다. 30분 안에 결제해 주세요. 이미 결제했다면 키가 이메일로 전송되니 다시 결제하지 마세요." },
  { title: "저절로 활성화", text: "결제 게이트웨이가 결제를 확인하면(앱이 몇 초마다 확인합니다) 요금제가 바로 컴퓨터에 적용되고 키가 이메일로 전송됩니다." },
])}
<p class="center-text reveal"><a class="btn btn-secondary" href="/ko/guide/buy-and-activate/">키 구매와 활성화 가이드 읽기 ${icon("arrow-right")}</a></p>
<p class="disclaimer">저희는 카드 번호나 은행 계좌 정보를 받지 않습니다. VietQR로 결제할 때는 이메일 주소를 PayOS에 보내지 않습니다. 해외 카드로 결제할 때는 결제 페이지를 미리 채우고 Creem이 영수증을 이메일로 보낼 수 있도록, 앱에 입력한 이메일을 Creem에 보냅니다. 카드 주문은 Creem이 판매자(merchant of record, 재판매자)로서 결제와 세금을 처리합니다.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "갱신과 요금제 변경", title: "유연하게, 하루 단위로 계산", center: true })}
<div class="grid grid-2">
<div class="card reveal"><h3>같은 요금제 갱신</h3><p>같은 요금제를 다시 사면 30일(Monthly), 180일(6 Months), 365일(Yearly)이 추가되며, 요금제가 아직 유효하면 만료일부터 계산합니다. 앱은 종료 7일 전과 만료 후에 알려 드립니다. 자동으로 청구되는 일은 절대 없습니다.</p></div>
<div class="card reveal"><h3>유효 기간 중 요금제 변경</h3><p>새 요금제는 바로 시작되고, 이전 요금제의 남은 일수는 <strong>하루당 가격</strong>으로 환산해 소수점 이하를 버립니다. 예를 들어 VND 가격으로(USD로 결제하면 두 요금제의 USD 가격으로 계산하므로 일수가 다를 수 있으며, 이 예에서는 최대 하루 차이) Monthly가 20일 남았을 때 Yearly를 사면 24일이 추가되고(Yearly는 389일이 됩니다), 6 Months를 사면 22일이 추가됩니다(6 Months는 202일이 됩니다). 환산된 일수와 새 만료일(예상)은 결제 전에 앱에 표시됩니다. 요금제 변경은 환불되지 않습니다.</p></div>
</div>
${callout({ title: "요금제가 만료되면", text: "컴퓨터가 아직 10일 체험 기간 안이면 Free로 돌아갑니다. 체험 기간이 끝났다면 번역을 계속하려면 유료 요금제가 필요합니다. 유료 요금제가 없으면 Pro 기능(기록, 용어집, 내보내기)이 잠깁니다." })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "요금 관련 질문", title: "구매 전에 물어보고 싶으실 내용" })}
${faq(PRICING_FAQ)}
</div></section>

${ctaBand({ title: "10일 체험부터 시작하세요", text: "하루 30분이면 실제 회의에서 시험해 보기에 충분합니다. 카드도 계정도 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/faq/", label: "자주 묻는 질문 읽기" } })}
`,
};
