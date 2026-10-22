import { pageHero, sectionHead, callout, facts, linkCard, icon } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";

const crumbs = [
  { name: "홈", path: "/ko/" },
  { name: "문의 및 지원", path: "/ko/contact/" },
];

const EMAIL = SITE.email;
// 제목과 본문 양식을 미리 채운 mailto 링크. HTML 속성 안에 있으므로 `&amp;`를 씁니다. 지원팀은 영어나 베트남어로 답하므로
// 항목 이름에 영어를 함께 적습니다.
const mail = (subject, body) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&amp;body=${encodeURIComponent(body.join("\n"))}` : ""}`;

const M = {
  support: mail("AI Translator technical support", [
    "AI Translator 버전(정보 화면) (App version):",
    "운영체제와 컴퓨터(예: macOS 15, MacBook Air M2 또는 Windows 11, Intel Core i5-1235U) (OS and computer):",
    "RAM:",
    "그래픽 카드(Windows PC인 경우) (Graphics card):",
    "모델 팩(Standard 또는 Lite) (Model pack):",
    "쓰고 있는 회의 앱 (Meeting app):",
    "무슨 일이 있었는지 (What happened):",
    "다시 일어나게 하는 단계 (Steps to reproduce):",
  ]),
  key: mail("Lost AI Translator license key", ["구매할 때 쓴 이메일 (Email used to buy):", "'설정 › 라이선스 › 키를 잃어버렸나요?'를 해 보셨나요(예/아니요) (Tried Lost your key?):"]),
  payment: mail("AI Translator payment problem", ["주문 번호(업그레이드 화면의 '주문 …' 줄) (Order code):", "구매할 때 쓴 이메일 (Email used to buy):", "결제 방법(VietQR 또는 해외 카드), 시각, 금액 (Payment method, time, amount):", "문제 (Problem):"]),
  refund: mail("AI Translator refund request", ["주문 번호 (Order code):", "결제일 (Payment date):", "이유 (Reason):"]),
  erase: mail("Request to delete or anonymize personal data", ["이 이메일과 연결된 개인 데이터의 삭제 또는 익명화를 요청합니다. (I ask you to delete or anonymize the personal data linked to this email.)", "(구매할 때 쓴 것과 같은 이메일로 보냅니다.) (Sent from the same email I used to buy.)"]),
  security: mail("[Security] AI Translator security report", ["발견한 내용 (What I found):", "재현 단계 (Steps to reproduce):", "영향을 받는 버전 또는 구성 요소 (Affected version or component):"]),
  feedback: mail("AI Translator feedback", ["필요한 것, 또는 잘 안 되는 것 (What you need, or what is not working well):"]),
};

const btn = (href, label) => `<p><a class="btn btn-secondary btn-sm" href="${href}">${icon("mail")} ${label}</a></p>`;

export default {
  id: "contact",
  lang: "ko",
  path: "/ko/contact/",
  title: "AI Translator 문의 및 지원",
  description:
    "support@aitranslator.io.vn으로 AI Translator에 문의하세요: 설치 파일, 기술 지원, 키 분실, 결제 문제, 환불, 데이터 삭제, 보안 신고.",
  schemaType: "ContactPage",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  body: () => `
${pageHero({
  crumbs,
  title: "문의 및 지원",
  lead: "AI Translator에 연락하는 방법은 support@aitranslator.io.vn으로 이메일을 보내는 것입니다. 이것이 유일한 지원 창구이며, 이 웹사이트에는 문의 양식이 없고 지원 전화도 없습니다.",
})}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["이메일", `<a href="mailto:${EMAIL}">${EMAIL}</a><small>지원팀은 영어 또는 베트남어로 답합니다. 영어나 베트남어로 보내 주시면 가장 원활합니다</small>`],
  ["다른 창구", "없음<small>웹 양식도 전화도 없습니다</small>"],
  ["답장", "답장 시간은 약속하지 않습니다<small>한 사람이 운영하는 제품이라 구체적인 답장 시간을 약속하지 않습니다</small>"],
  ["보안 신고", `<a href="/.well-known/security.txt">/.well-known/security.txt</a><small>또는 제목을 [Security]로 시작하는 이메일</small>`],
])}</div>
<p class="center-text reveal"><a class="btn btn-primary btn-lg" href="mailto:${EMAIL}">${icon("mail")} 이메일 보내기</a></p>
<p class="disclaimer">아래 어떤 요청에도 비밀번호, 카드 번호, 은행 계좌 번호를 보낼 필요가 없습니다. 저희는 그런 정보가 필요 없으며 받지도 않습니다.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "보낼 내용", title: "무엇이 필요하신가요? 이 정보와 함께 이메일을 보내 주세요", text: "아래 버튼을 누르면 제목과 양식이 채워진 채로 이메일 앱이 열립니다. 열리지 않으면 위 주소로 직접 써서 보내 주세요.", center: true })}
<div class="grid grid-2">

<div class="card reveal" id="installer">
<h3>이메일로 설치 파일 받기</h3>
<p>macOS와 Windows 모두 다운로드 페이지의 명령 한 줄로 설치할 수 있어 이메일이 필요 없습니다. macOS .dmg나 Windows .exe를 이메일로 받고 싶다면 다운로드 페이지의 양식(macOS용과 Windows용이 따로 있습니다)으로 이메일을 보내 주세요: 컴퓨터 모델과 칩 또는 프로세서, macOS나 Windows 버전, RAM, 쓰는 회의 앱, 필요한 언어. 확인하실 수 있도록 설치 파일을 SHA-256 체크섬과 함께 보내 드립니다.</p>
<p><a class="btn btn-secondary btn-sm" href="/ko/download/">다운로드 페이지 열기 ${icon("arrow-right")}</a></p>
</div>

<div class="card reveal" id="technical-support">
<h3>기술 지원</h3>
<p>다음을 함께 보내 주세요: 앱 버전(정보 화면), macOS 버전과 칩(Apple 메뉴 › 이 Mac에 관하여) 또는 Windows 버전과 프로세서(설정 › 시스템 › 정보)와 그래픽 카드, RAM, 쓰는 모델 팩(설정 › 모델: Standard 또는 Lite), 회의 앱, 문제가 생기기까지의 단계, 오류 메시지가 있다면 그 문구.</p>
<p>가장 빠른 방법: '정보 › 지원팀에 로그 보내기'로 가서 표시되는 보고서 코드(R-XXXX-XXXX 같은 형식)를 이메일에 적어 주세요. 그 코드로 로그를 찾을 수 있습니다. 로그에는 말한 내용이 절대 들어가지 않으며, 개인 정보는 보내기 전에 지워집니다. 파일을 직접 첨부하고 싶다면 '정보 › 로그 폴더 열기'로 가세요. 흔한 문제는 대부분 금방 해결되니 먼저 <a href="/ko/guide/troubleshooting/">문제 해결 단계</a>를 해 보세요.</p>
${btn(M.support, "기술 지원에 이메일 보내기")}
</div>

<div class="card reveal" id="lost-key">
<h3>라이선스 키 분실</h3>
<p>직접 되찾을 수 있습니다: '설정 › 라이선스 › 키를 잃어버렸나요?'로 가서 구매할 때 쓴 이메일을 입력하고 '내 키 보내기'를 고르세요. 메일은 no-reply@mail.aitranslator.io.vn에서 오니 스팸 폴더도 확인하세요. 그래도 오지 않으면 구매할 때 쓴 주소로 저희에게 이메일을 보내 주세요. <a href="/ko/guide/buy-and-activate/">키 구매와 활성화 가이드</a>도 참조하세요.</p>
${btn(M.key, "키 분실 문의 보내기")}
</div>

<div class="card reveal" id="payment">
<h3>결제 문제</h3>
<p>결제했는데 키가 오지 않았거나, 금액이 부족했거나, 주문이 실패했다면 주문 번호(업그레이드 화면의 '주문 …' 줄), 구매할 때 쓴 이메일, 결제 방법, 시각과 금액을 보내 주세요. 카드로 결제했다면 입력한 주소로 Creem이 보낸 영수증이 있으면 함께 첨부해 주세요. VietQR 이체는 사용하시는 은행과 PayOS가 처리합니다. 카드 결제는 Creem이 판매자(merchant of record, 재판매자)로서 결제와 세금을 처리하며, 저희는 은행 계좌나 카드 정보를 받지 않습니다.</p>
${btn(M.payment, "결제 문의 보내기")}
</div>

<div class="card reveal" id="refund">
<h3>환불 요청</h3>
<p>결제일로부터 <strong>7일 이내</strong>에 주문 번호와 이유를 적어 먼저 저희에게 요청해 주세요. 결제 금액은 환불되지 않습니다. 다만 저희 쪽 오류로 구매한 요금제를 쓸 수 없고 합리적인 기간 안에 고칠 수 없는 경우, 또는 법에서 달리 정한 경우는 예외이며, 요금제 변경은 환불되지 않습니다. 카드 결제는 Creem이 판매자(merchant of record)이므로 Creem이 Creem의 약관에 따라 환불할 수도 있습니다. 저희가 7일 넘게 답하지 않으면 Creem에 연락하실 수 있습니다(creem.io/my-orders/login에서 주문 조회). 주문이 환불되면(전액이든 일부든, 카드 분쟁을 통한 경우도 포함) 그 주문으로 라이선스에 추가된 기간을 줄이거나, 라이선스가 그 주문만으로 이루어져 있으면 라이선스를 취소할 수 있습니다. 이는 자동이 아니며 운영자가 건별로 판단합니다. 자세한 내용은 <a href="/en/terms/">이용약관(영어)</a>에 있습니다.</p>
${btn(M.refund, "환불 요청 보내기")}
</div>

<div class="card reveal" id="delete-data">
<h3>개인 데이터 삭제 또는 익명화</h3>
<p>본인 확인을 위해 <strong>구매할 때 쓴 것과 같은 이메일로</strong> 요청을 보내 주세요. 이메일과 기기 이름을 삭제합니다. 최소한의 데이터(해시 처리한 기기 ID, 동의한 시각, 회계에 필요한 주문 기록)는 남으며, 라이선스는 계속 작동하지만 더 이상 이메일로 되찾을 수 없습니다. Creem 페이지에서 입력한 데이터는 Creem의 정책에 따라 Creem이 보관하므로, 그곳에서 삭제하려면 Creem에 연락하세요. 전체 목록은 <a href="/ko/data-security/#delete-data">데이터와 보안</a>에 있습니다. 내 컴퓨터에 있는 데이터는 앱 안에서 바로 삭제할 수 있습니다.</p>
${btn(M.erase, "데이터 삭제 요청하기")}
</div>

<div class="card reveal" id="security">
<h3>보안 문제 신고</h3>
<p>앱, 라이선스 서버, 이 웹사이트에서 취약점을 발견했다고 생각되면 제목을 [Security]로 시작하는 이메일을 보내 주시고, 설명, 재현 단계, 영향을 받는 버전을 적어 주세요. 저희와 메시지를 주고받기 전까지는 공개하지 말아 주세요. 보안 연락처는 <a href="/.well-known/security.txt">security.txt</a> 파일에도 있습니다.</p>
${btn(M.security, "보안 신고 보내기")}
</div>

<div class="card reveal" id="feedback">
<h3>의견과 새로운 요구</h3>
<p>다른 언어가 필요하거나, 여러 컴퓨터에서 쓰고 싶거나, 다른 아이디어가 있으신가요? <a href="/ko/about/#under-consideration">다음 단계</a>에서 무엇을 검토할지의 순서는 사용자 의견에 따라 정해집니다(약속은 아닙니다). AI Translator를 어디에 쓰시는지 알려 주세요.</p>
${btn(M.feedback, "의견 보내기")}
</div>

</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "보내기 전에", title: "바로 답을 찾으실 수도 있습니다" })}
${callout({ title: "연락처에 관하여.", text: "AI Translator의 제공자는 Đỗ Tiến Phong(개인)입니다. 이 웹사이트에는 주소, 전화번호, 세금 번호를 공개하지 않았으며, 모든 연락은 위 이메일로 받습니다." })}
<div class="grid grid-3">
${linkCard({ href: "/ko/faq/", icon: "message", title: "자주 묻는 질문", text: "설치, 개인정보, 요금제, 결제에 대한 짧은 답.", more: "자주 묻는 질문 읽기" })}
${linkCard({ href: "/ko/guide/troubleshooting/", icon: "support", title: "문제 해결", text: "흔한 문제와 단계별 해결 방법.", more: "가이드 보기" })}
${linkCard({ href: "/ko/data-security/", icon: "shield", title: "데이터와 보안", text: "내 컴퓨터에 남는 것, 서버가 저장하는 것과 보관 기간.", more: "자세히 읽기" })}
</div>
</div></section>
`,
};
