"""Ảnh mô phỏng giao diện "Phân biệt người nói" trên giao diện thật (scripts/ui-preview, IPC giả): chèn DOM + CSS rồi chụp.
Không sửa mã của app."""
import json
import sys

from playwright.sync_api import sync_playwright

OUT = sys.argv[1]
B = "http://127.0.0.1:1430"

COLORS = ["#7cc4ff", "#ffb86b", "#9be38f", "#f59fd5", "#c7a6ff", "#ffe27a", "#6fe0d2", "#ff8f8f"]
COLORS_LIGHT = ["#1f6fd1", "#c25e00", "#2f8a3b", "#b8378f", "#7048c9", "#9a7a00", "#0f8a7e", "#c93a3a"]

CONVO = [
    ("Lan Nguyễn", 0, "The design review moved to Thursday afternoon.", "Buổi duyệt thiết kế đã dời sang chiều thứ Năm."),
    ("Lan Nguyễn", 0, "We need to finish it before the end of the month.", "Chúng ta cần xong trước cuối tháng."),
    ("Minh Trần", 1, "I'm worried about the testing phase.", "Tôi lo về giai đoạn kiểm thử."),
    ("Người 3", 2, "Can you share the budget estimate by Friday?", "Bạn có thể gửi bản dự toán ngân sách trước thứ Sáu không?"),
    ("Lan Nguyễn", 0, "Sure, I'll send it tomorrow.", "Được, mai tôi gửi."),
]

OVERLAY_CSS = """
.line.spk { border-left: 0.16em solid var(--spk); padding-left: 0.45em; margin-left: 0.1em; }
.spk-label { color: var(--spk); font-size: 0.56em; font-weight: 700; letter-spacing: 0.01em; margin: 0.35em 0 0.05em 0.25em; }
.spk-hint { display:flex; align-items:center; gap:0.5em; font-size: 0.48em; color: #fff; background: rgba(255,255,255,0.14);
  border-radius: 0.5em; padding: 0.35em 0.7em; margin: 0.1em 0 0.4em; width: fit-content; }
.spk-hint b { color: #ffe27a; font-weight: 600; }
.spk-hint .x { opacity: .7; margin-left: .4em; }
"""


def overlay_js(convo, hint=None):
    return """
([convo, colors, css, hint]) => {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const lines = document.querySelector('.lines'); lines.innerHTML = '';
  if (hint) { const h = document.createElement('div'); h.className = 'spk-hint'; h.innerHTML = hint; lines.appendChild(h); }
  let prev = null;
  for (const [name, ci, src, tgt] of convo) {
    if (name !== prev) {
      const lab = document.createElement('div'); lab.className = 'spk-label'; lab.textContent = name;
      lab.style.setProperty('--spk', colors[ci]); lines.appendChild(lab);
    }
    const d = document.createElement('div'); d.className = 'line translated spk'; d.style.setProperty('--spk', colors[ci]);
    d.innerHTML = `<div class="source"></div><div class="main"></div>`;
    d.querySelector('.source').textContent = src; d.querySelector('.main').textContent = tgt;
    lines.appendChild(d); prev = name;
  }
}
""", [convo, COLORS, OVERLAY_CSS, hint]


TRANSCRIPT_CSS = """
.spk-chip { display:inline-flex; align-items:center; gap:6px; font-size: 13px; font-weight: 600; color: var(--spk);
  border: 1px solid color-mix(in srgb, var(--spk) 35%, transparent); background: color-mix(in srgb, var(--spk) 9%, transparent);
  border-radius: 999px; padding: 1px 10px 1px 8px; margin: 0 0 6px; cursor: pointer; }
.spk-chip::before { content:''; width:8px; height:8px; border-radius:50%; background: var(--spk); }
.spk-chip .caret { opacity:.6; font-weight:400; }
ol.transcript li.spk-cont { border-top: none; padding-top: 2px; }
ol.transcript li { position: relative; }
ol.transcript li.spk-bar::after { content:''; position:absolute; left:0; top:10px; bottom:10px; width:3px; border-radius:2px; background: var(--spk); }
.spk-pop { position:absolute; z-index:10; width: 300px; background: var(--surface, #fff); border:1px solid rgba(0,0,0,.12);
  border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.18); padding: 6px; font-size: 14px; }
.spk-pop .hd { font-size: 12px; color: #6b7280; padding: 6px 10px 4px; }
.spk-pop .it { padding: 8px 10px; border-radius: 8px; display:flex; align-items:center; gap:8px; }
.spk-pop .it.on { background: rgba(31,111,209,.08); }
.spk-pop .dot { width:8px; height:8px; border-radius:50%; }
.spk-pop .sep { height:1px; background: rgba(0,0,0,.08); margin: 4px 6px; }
.spk-pop input { width: 100%; box-sizing: border-box; font: inherit; padding: 7px 10px; border:1px solid #c9d2e0; border-radius: 8px; }
"""


def transcript_js():
    convo = [
        ("10:27:22", "Lan Nguyễn", 0, "en", "The design review moved to Thursday afternoon.", "Buổi duyệt thiết kế đã dời sang chiều thứ Năm."),
        ("10:27:26", "Lan Nguyễn", 0, "en", "We need to finish it before the end of the month.", "Chúng ta cần xong trước cuối tháng."),
        ("10:27:41", "Minh Trần", 1, "en", "I'm worried about the testing phase.", "Tôi lo về giai đoạn kiểm thử."),
        ("10:28:03", "Người 3", 2, "zh", "我们下周可以确认合同条款。", "Tuần sau chúng ta có thể xác nhận các điều khoản hợp đồng."),
        ("10:28:15", "Lan Nguyễn", 0, "en", "Sure, I'll send it tomorrow.", "Được, mai tôi gửi."),
    ]
    return """
([convo, colors, css]) => {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const ol = document.querySelector('ol.transcript'); ol.innerHTML = '';
  let prev = null, popAnchor = null;
  for (const [time, name, ci, lang, src, tgt] of convo) {
    const li = document.createElement('li'); li.className = 'translated spk-bar'; li.style.setProperty('--spk', colors[ci]);
    if (name === prev) li.classList.add('spk-cont');
    li.innerHTML = `<time>${time}</time><div>${name !== prev ? `<div class="spk-chip">${name} <span class="caret">▾</span></div>` : ''}<div class="src" lang="${lang}"></div><div class="tgt"></div></div>`;
    li.querySelector('.src').textContent = src; li.querySelector('.tgt').textContent = tgt;
    ol.appendChild(li); if (name === 'Người 3') popAnchor = li.querySelector('.spk-chip'); prev = name;
  }
  const r = popAnchor.getBoundingClientRect();
  const pop = document.createElement('div'); pop.className = 'spk-pop';
  pop.style.left = (r.left + window.scrollX) + 'px'; pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
  pop.innerHTML = `
    <div class="hd">Đổi tên "Người 3"</div>
    <div style="padding:2px 6px 6px"><input value="Hoa" /></div>
    <div class="sep"></div>
    <div class="hd">Chọn người trong cuộc họp</div>
    <div class="it on"><span class="dot" style="background:#9a7a00"></span>Hoa Phạm</div>
    <div class="it"><span class="dot" style="background:#7048c9"></span>Tuấn Lê</div>
    <div class="sep"></div>
    <div class="it">Gộp vào người khác ▸</div>`;
  document.body.appendChild(pop);
}
""", [convo, COLORS_LIGHT, TRANSCRIPT_CSS]


SETTINGS_JS = """
() => {
  const panel = document.querySelector('[role=tabpanel]');
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <h2 style="font-size:17px;font-weight:600;margin:22px 2px 10px">Người nói</h2>
  <div class="card list" id="spk-card">
    <div class="field"><div class="field-text"><label class="field-label">Phân biệt người nói</label>
      <p class="hint">Mỗi người một màu trên phụ đề. Nhận giọng ngay trên máy; không lưu, không gửi đi, hết phiên thì xóa.</p></div>
      <div class="field-control"><input class="switch" type="checkbox" checked></div></div>
    <div class="field"><div class="field-text"><label class="field-label">Lấy tên từ Teams, Meet, Zoom</label>
      <p class="hint">Hiện tên người đang nói, đọc từ cửa sổ cuộc họp (Teams và Zoom bản cài, Meet trong Chrome hoặc Edge). Không đọc chat, không chụp màn hình. Chưa đọc được tên thì hiện "Người 1", "Người 2".</p></div>
      <div class="field-control"><input class="switch" type="checkbox" checked></div></div>
    <div class="field"><div class="field-text"><span class="field-label">Quyền Trợ năng</span>
      <p class="hint">Chưa cấp. Cần để đọc tên trong cửa sổ cuộc họp (dùng chung với Gõ dịch).</p></div>
      <div class="field-control"><button>Cấp quyền Trợ năng</button></div></div>
  </div>`;
  panel.appendChild(wrap);
  document.getElementById('spk-card').scrollIntoView({block: 'end'});
}
"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")

        def shot(name, url, w, h, js=None, arg=None, clip=None):
            pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1.5)
            pg.goto(B + url)
            pg.wait_for_timeout(2500)
            if js:
                pg.evaluate(js, arg) if arg is not None else pg.evaluate(js)
                pg.wait_for_timeout(400)
            pg.screenshot(path=f"{OUT}/{name}.png", clip=clip)
            pg.close()

        js, arg = overlay_js(CONVO)
        shot("1-thanh-phu-de", "/overlay.html?session=running&lang=vi", 760, 600, js, arg)
        js, arg = overlay_js(
            [("Người 1", 0, "The design review moved to Thursday afternoon.", "Buổi duyệt thiết kế đã dời sang chiều thứ Năm."),
             ("Người 2", 1, "I'm worried about the testing phase.", "Tôi lo về giai đoạn kiểm thử.")],
            hint="🔒 Cho phép quyền Trợ năng để hiện tên người nói <b>Mở Cài đặt</b><span class='x'>✕</span>")
        shot("2-thanh-phu-de-chua-cap-quyen", "/overlay.html?session=running&lang=vi", 760, 300, js, arg)
        js, arg = transcript_js()
        shot("3-ban-chep-loi-doi-ten", "/?screen=transcript&lang=vi", 960, 900, js, arg)
        shot("4-cai-dat-nguoi-noi", "/?screen=settings&group=subtitles&lang=vi", 960, 640, SETTINGS_JS)
        b.close()


main()
