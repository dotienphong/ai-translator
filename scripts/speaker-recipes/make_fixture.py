"""Dựng fixture cây giao diện ẩn danh cho bộ đọc tên (spec 2026-10-26-phan-biet-nguoi-noi §12; kế hoạch 04 Task 3, QĐ 16) từ bản
ghi `axtrace watch` của kế hoạch 01 (có tên thật và định danh tài khoản, nằm ngoài git).

python3 -I make_fixture.py names <ánh xạ.json> <teams-watch.jsonl>... --meet <chrome-watch.jsonl>...
    Dựng ánh xạ {"tên thật": "tên giả"} mà không in tên nào: tên sau "Myself video, " (Teams) và chữ tĩnh đầu tiên trong ô có lớp
    `oZRSLe` (Meet, trừ "Lan", "Minh", "Bạn", "You") → "Hoa Phạm"; tên hồ sơ Chrome (đuôi tiêu đề cửa sổ sau "Google Chrome - ")
    → "Hoa". Chỉ in số tên. File ánh xạ nằm ở $DATA, không bao giờ vào repo.
python3 -I make_fixture.py build <watch.jsonl> <truth.json> <ra.jsonl> --names <ánh xạ.json> --window <regex tiêu đề cửa sổ>
    (`<watch.jsonl>`: bản ghi `axtrace watch` (khóa `texts`) hay `ax-record fixture`, `uia-record fixture` (khóa `lines`); vai trò
    cửa sổ, vùng web, chữ tĩnh của macOS và của Windows đều nhận.)
        [--web-area] [--seconds 60] [--title <tiêu đề thay cho cửa sổ>]
    - Chỉ giữ cửa sổ có tiêu đề khớp `--window`; `--web-area`: chỉ giữ cây con của `AXWebArea` có tiêu đề khớp (bỏ thẻ, thanh địa
      chỉ, dấu trang của trình duyệt). `--title`: thay tiêu đề dòng cửa sổ (tiêu đề Chrome có tên hồ sơ).
    - Bỏ lớp CSS nguyên tử của Teams (`f…`, `___…`, `r…`); giữ lớp có nghĩa (`vdi-frame-occlusion`, `oZRSLe`…).
    - Mọi định danh tài khoản Teams (`8:live:…`, `8:orgid:…`, `8:guest:…`, `8:teamsvisitor:…`, bot `28:<id>`) và mọi UUID, ở mọi
      trường, thành id giả ổn định (`anon-1`, `uuid-1`…, cùng chuỗi gốc cùng id giả). Lớp `bkg_<base64>` của Teams (base64 của 8
      ký tự hex trong định danh tài khoản + "8guest…"/"8livecid") cũng thế, ở mọi trường: `bkg_anon-1`, `bkg_anon-2`…
    - Tên trong ánh xạ chỉ thay trong các trường chữ (title, desc, value, ident, help, dom), theo ranh giới từ (không đụng vai trò,
      lớp); mã phòng Meet thành `abc-defg-hij`.
    - Dừng, không ghi file, khi file ra còn một mẫu cấm (`8:live:`, `8:orgid:`, `8:guest:`, `8:teamsvisitor:`, `28:<id>`, `.cid.`,
      `@`, `http`, `/Users/`, `C:\\Users`, `C:/Users` (so sau khi bỏ thoát JSON, không phân biệt hoa thường), UUID, lớp `bkg_<base64>`
      chưa thay, chuỗi ≥ 16 ký tự giải base64 ra định danh tài khoản) hay một tên thật của ánh xạ (không phân biệt hoa thường); chỉ in
      tên của phép kiểm và số lần.
    - Ghi `<ra>` (mỗi dòng {"t": giây từ ảnh chụp đầu, "lines": [...]}) và `<ra bỏ .jsonl>.truth.json` ({"steps": [{"t", "who",
      "on"}]}; khách tự động "lan", "minh" thành "Lan", "Minh"; giọng đọc máy "nguoinoi" giữ nguyên).
python3 -I make_fixture.py review <fixture.jsonl>...
    In các chuỗi khác nhau theo từng trường (title, desc, value, ident, help, dom, lớp) của mọi file (tiêu đề chỉ tên file, chuỗi chỉ
    có khoảng trắng in thành `⟨chỉ khoảng trắng, N ký tự⟩`), cho người duyệt xem trước khi chép vào repo.
"""
import argparse
import base64
import binascii
import json
import os
import re
import sys

ATOMIC = re.compile(r"^(?:f[0-9a-z]{5,8}|___[0-9a-z]{5,9}|r[0-9a-z]{6,8})$")
MEET_CODE = re.compile(r"\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b")
GUESTS = {"lan": "Lan", "minh": "Minh"}
# Định danh tài khoản Teams (MRI): "8:live:.cid.…", "8:orgid:<uuid>", "8:guest:<uuid>", "8:teamsvisitor:…"; bot "28:<id>" (bắt
# đầu bằng chữ, hay là UUID). Không đi sau chữ, số hay ":" (giờ "10:28:15" không bị thay).
MRI = re.compile(r"(?<![0-9A-Za-z:])(?:8:[A-Za-z]+:[\w.:\-]+|28:(?:[A-Za-z][\w.:\-]*|[0-9A-Fa-f]{8}-[\w.:\-]+))")
# Id bot: sau "28:" là chữ cái hay UUID; không phải chữ số (thời lượng "28:30") hay sau ":" (giờ "1:28:15").
BOT = re.compile(r"(?<![0-9A-Za-z:])28:(?:[A-Za-z]|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-)")
UUID = re.compile(r"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}")
# Lớp nền ô video của Teams: "bkg_" + base64 (bỏ "=") của 8 ký tự hex trong định danh tài khoản + "8guest…"/"8livecid".
BKG = re.compile(r"bkg_[A-Za-z0-9+/=_-]{8,}")
FAKE_BKG = re.compile(r"bkg_anon-[0-9]+")
# Chuỗi có thể là base64 (chuẩn hay urlsafe) và chữ đặc trưng của định danh tài khoản sau khi giải.
B64_TOKEN = re.compile(r"[A-Za-z0-9+/=_-]{16,}")
ACCOUNT_TEXT = re.compile(rb"guest|livecid|live:|orgid|teamsvisitor|[0-9a-f]{8}8?[g-z]", re.I)
FORBIDDEN = ["8:live:", "8:orgid:", "8:guest:", "8:teamsvisitor:", ".cid.", "@", "http", "/users/", "c:\\users", "c:/users"]
FIELD_NAMES = ["title", "desc", "value", "ident", "help", "dom", "lớp"]
# Trường có chữ: title, desc, value, ident, help, dom (định dạng `độ sâu|role|subrole|title|desc|value|ident|help|dom|lớp`).
TEXT_FIELDS = range(3, 9)


# Vai trò theo hệ điều hành: cửa sổ, vùng web, chữ tĩnh (macOS: AX…; Windows: tên loại điều khiển UI Automation, kế hoạch 05).
WINDOW_ROLES = ("AXWindow", "Window")
WEB_ROLES = ("AXWebArea", "Document")
TEXT_ROLES = ("AXStaticText", "Text")


def snapshot_lines(snap):
    """Các dòng của một ảnh chụp: `texts` (bản ghi `axtrace`) hay `lines` (`ax-record fixture`, `uia-record fixture`)."""
    return snap["texts"] if "texts" in snap else snap["lines"]


def fields(line):
    f = line.split("|", 9)
    return f if len(f) == 10 else None


# Ảnh đại diện trong bảng People của Teams Windows: lớp nguyên tử (`___jc9uze0 f71fsbu` ↔ `___ansmq00 fhuq1gn`) là CHÍNH chỉ báo
# "đang nói" (kế hoạch 05b Task 11), nên giữ chúng ở các dòng này; lớp nguyên tử là hash kiểu của Griffel, không mang định danh.
KEEP_ATOMIC_IDENT = "roster-avatar-img-"


def strip_classes(f):
    if f[6].startswith(KEEP_ATOMIC_IDENT):
        return
    f[9] = " ".join(c for c in f[9].split() if not ATOMIC.match(c))


def meeting_lines(lines, title_re, web_area, new_title):
    out, keep, web_depth = [], False, None
    for line in lines:
        f = fields(line)
        if f is None:
            continue
        d = int(f[0])
        if d == 0:
            keep = f[1] in WINDOW_ROLES and bool(title_re.search(f[3]))
            web_depth = None
            if keep:
                if new_title is not None:
                    f[3], f[4] = new_title, ""
                out.append(f)
            continue
        if not keep:
            continue
        if web_area:
            if web_depth is not None and d <= web_depth:
                web_depth = None
            if web_depth is None:
                if f[1] in WEB_ROLES and title_re.search(f[3]):
                    web_depth = d
                    out.append(f)
                continue
        out.append(f)
    return out


def word(name):
    return re.compile(r"(?<!\w)" + re.escape(name) + r"(?!\w)")


class Anonymizer:
    def __init__(self, names):
        # Tên dài thay trước (một tên có thể là phần của tên khác).
        self.names = [(word(real), fake) for real, fake in sorted(names.items(), key=lambda kv: -len(kv[0]))]
        self.ids = {}

    def fake_id(self, prefix, m):
        key = m.group(0)
        if key not in self.ids:
            self.ids[key] = f"{prefix}-{sum(1 for v in self.ids.values() if v.startswith(prefix)) + 1}"
        return self.ids[key]

    def line(self, f):
        strip_classes(f)
        for i in range(1, 10):
            f[i] = MRI.sub(lambda m: self.fake_id("anon", m), f[i])
            f[i] = UUID.sub(lambda m: self.fake_id("uuid", m), f[i])
            f[i] = BKG.sub(lambda m: m.group(0) if FAKE_BKG.fullmatch(m.group(0)) else self.fake_id("bkg_anon", m), f[i])
        for i in TEXT_FIELDS:
            for pattern, fake in self.names:
                f[i] = pattern.sub(fake, f[i])
            f[i] = MEET_CODE.sub("abc-defg-hij", f[i])
        return "|".join(f)


def b64_account_id(token):
    """Chuỗi (hay một đoạn sau dấu `_ - . :` của nó) giải base64 chuẩn hay urlsafe, có hay không "=", ra chữ của định danh tài
    khoản (`guest`, `livecid`, `live:`, `orgid`, 8 hex + chữ)."""
    pieces = {token} | {token[i + 1 :] for i, c in enumerate(token) if c in "_-.:"}
    for piece in pieces:
        core = piece.rstrip("=")
        for off in range(4):
            s = core[off:]
            if len(s) < 16:
                break
            s += "=" * (-len(s) % 4)
            for alt in (None, b"-_"):
                try:
                    raw = base64.b64decode(s, altchars=alt, validate=True)
                except (binascii.Error, ValueError):
                    continue
                if ACCOUNT_TEXT.search(raw):
                    return True
    return False


def leaks(text, real_names):
    r"""Tên các phép kiểm còn trúng và số lần; không trả chuỗi trúng. Văn bản là JSON: `\\` (dấu `\` đã thoát) quy về `\` trước khi
    so, để đường dẫn Windows `C:\\Users` trong JSON vẫn bị bắt (rà soát lần 2 A-NHỎ 1)."""
    low = text.lower().replace("\\\\", "\\")
    found = {f"mẫu cấm {p!r}": low.count(p) for p in FORBIDDEN if p in low}
    if BOT.search(text):
        found["định danh 28:"] = len(BOT.findall(text))
    if UUID.search(text):
        found["UUID"] = len(UUID.findall(text))
    bkg = [m for m in BKG.findall(text) if not FAKE_BKG.fullmatch(m)]
    if bkg:
        found["lớp bkg_ chưa thay"] = len(bkg)
    b64 = sum(1 for t in B64_TOKEN.findall(text) if b64_account_id(t))
    if b64:
        found["định danh base64"] = b64
    hits = sum(len(re.findall(r"(?<!\w)" + re.escape(r.lower()) + r"(?!\w)", low)) for r in real_names)
    if hits:
        found["tên thật trong ánh xạ"] = hits
    return found


def cmd_names(a):
    found = set()
    myself = re.compile(r"Myself video, ([^,|]+)")
    for path in a.teams:
        for line in open(path, encoding="utf-8"):
            for snap_line in snapshot_lines(json.loads(line)) if line.strip() else []:
                found.update(m.group(1).strip() for m in myself.finditer(snap_line))
    host = {n: "Hoa Phạm" for n in found}
    profiles = set()
    for path in a.meet:
        for line in open(path, encoding="utf-8"):
            if not line.strip():
                continue
            pending = None
            for x in snapshot_lines(json.loads(line)):
                f = fields(x)
                if f is None:
                    continue
                d = int(f[0])
                if d == 0 and " - Google Chrome - " in f[3]:
                    profiles.add(f[3].rsplit(" - Google Chrome - ", 1)[1].strip())
                if pending is not None and d <= pending:
                    pending = None
                if "oZRSLe" in f[9].split():
                    pending = d
                elif pending is not None and f[1] in TEXT_ROLES and f[5].strip():
                    name = f[5].strip()
                    if name not in ("Lan", "Minh", "Bạn", "You"):
                        host[name] = "Hoa Phạm"
                    pending = None
    for p in profiles:
        host.setdefault(p, "Hoa")
    host = {k: v for k, v in host.items() if k}
    json.dump(host, open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(host)} tên trong ánh xạ → {a.out}")


def cmd_build(a):
    names = json.load(open(a.names, encoding="utf-8"))
    anon = Anonymizer(names)
    title_re = re.compile(a.window)
    snaps = [json.loads(line) for line in open(a.watch, encoding="utf-8") if line.strip()]
    t0 = snaps[0]["t"]
    out = []
    for s in snaps:
        if s["t"] - t0 > a.seconds:
            break
        lines = meeting_lines(snapshot_lines(s), title_re, a.web_area, a.title)
        out.append({"t": round(s["t"] - t0, 3), "lines": [anon.line(f) for f in lines]})
    truth = json.load(open(a.truth, encoding="utf-8"))
    steps = [
        {"t": round(x["t"] - t0, 3), "who": GUESTS.get(x["g"], x["g"]), "on": x["on"]}
        for x in truth["steps"]
        if x["t"] - t0 <= a.seconds + 5
    ]
    body = "\n".join(json.dumps(o, ensure_ascii=False) for o in out) + "\n"
    truth_body = json.dumps({"steps": steps}, ensure_ascii=False, indent=1) + "\n"
    found = leaks(body + truth_body, names.keys())
    if found:
        sys.exit(f"không ghi file: {found}")
    open(a.out, "w", encoding="utf-8").write(body)
    open(re.sub(r"\.jsonl$", ".truth.json", a.out), "w", encoding="utf-8").write(truth_body)
    print(f"{len(out)} ảnh chụp, {sum(len(o['lines']) for o in out)} dòng, {len(body)} byte, {len(anon.ids)} id giả → {a.out}")


def cmd_review(a):
    for path in a.files:
        by_field = [set() for _ in FIELD_NAMES]
        for line in open(path, encoding="utf-8"):
            if not line.strip():
                continue
            for x in json.loads(line)["lines"]:
                f = fields(x)
                if f is None:
                    continue
                for k, i in enumerate(range(3, 10)):
                    values = f[i].split() if i == 9 else [f[i]]
                    by_field[k].update(v for v in values if v)
        print(f"== {os.path.basename(path)}")
        for name, values in zip(FIELD_NAMES, by_field):
            print(f"-- {name}: {len(values)} chuỗi khác nhau")
            for v in sorted(values):
                print(f"   {v}" if v.strip() else f"   ⟨chỉ khoảng trắng, {len(v)} ký tự⟩")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("names")
    n.add_argument("out")
    n.add_argument("teams", nargs="+")
    n.add_argument("--meet", nargs="+", default=[])
    b = sub.add_parser("build")
    b.add_argument("watch")
    b.add_argument("truth")
    b.add_argument("out")
    b.add_argument("--names", required=True)
    b.add_argument("--window", required=True)
    b.add_argument("--web-area", action="store_true")
    b.add_argument("--seconds", type=float, default=60.0)
    b.add_argument("--title")
    r = sub.add_parser("review")
    r.add_argument("files", nargs="+")
    a = ap.parse_args()
    {"names": cmd_names, "build": cmd_build, "review": cmd_review}[a.cmd](a)


if __name__ == "__main__":
    main()
