"""A7 (spec §3.3, §10.1): kiểm nhật ký mạng của một lần thử, ghi qua proxy ở dạng HAR (mitmproxy `--set hardump=…`,
Proxyman, Charles đều xuất được).

Luật:
- Mọi request ra ngoài (trừ `127.0.0.1`, `localhost`, `::1`) phải tới máy chủ và đường dẫn có trong danh sách cho phép
  (`--allow`, JSON). Mỗi đường dẫn ghi kèm có được gọi trong lúc dịch không (`during_session`): A7 chỉ cho các việc chạy
  theo lịch (kiểm tra bản quyền, hỏi giờ của license server, kiểm tra cập nhật app và manifest model).
- Trong khoảng `--start`…`--stop` (lúc bấm Bắt đầu tới lúc bấm Dừng; bắt buộc, có múi giờ) chỉ request có
  `during_session: true`. Mốc Dừng phải sau mốc Bắt đầu, và cả cửa sổ phải nằm giữa request đầu và request cuối của nhật ký
  (08b bấm "Kiểm tra ngay" trước Bắt đầu và sau Dừng): mốc đảo hay sai múi giờ thì lỗi, không lặng lẽ tắt luật (Q3 của
  review 08 lần 2).
- Không request nào có thân lớn hơn `max_body_bytes`, hay có kiểu `audio/*`, `multipart/*`, `application/octet-stream`.
- Không URL hay thân request nào chứa một "từ mồi" (`canaries`): cụm từ có trong câu đã phát vào app lúc thử. So sau khi
  chuẩn hóa NFC và đổi chữ thường.
- Phải có ít nhất một request ra ngoài, để chứng minh proxy thật sự thấy lưu lượng của app. Nhật ký phải chỉ có lưu lượng
  của app và tiến trình phụ (mitmproxy `--mode local:…`, hay lọc theo app trong Proxyman trước khi xuất): HAR không ghi
  tiến trình gửi, nên request của trình duyệt hay app khác sẽ thành vi phạm.
- Từ mồi so trên URL và thân đã giải mã (`%XX`, dấu `+` của query và form, `\\uXXXX` của JSON; N4 của review 08 lần 2).
- Mốc người ghi được đối chiếu với log của app (`--app-log`: dòng "bắt đầu phiên dịch", "kết thúc phiên dịch" của
  `session.rs`, giờ địa phương, lấy múi giờ của `--start`): cửa sổ kiểm là hợp của mốc đã ghi và mọi phiên trong log trùng
  với nó, nên ghi Dừng sớm hay Bắt đầu muộn không làm sót phần phiên nào. Log không có phiên trùng mốc, hay phiên chưa có
  dòng kết thúc, là lỗi (N3 của review 08 lần 3).
- Kết quả tự khai nơi chạy (`os`, `host` như `soak.py`) và SHA-256 của file HAR: chạy trên chính máy đã thử (Q1).
"""
import argparse
import hashlib
import json
import os
import sys
import unicodedata
import re
from datetime import datetime
from urllib.parse import unquote_plus, urlsplit

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from soak import origin  # noqa: E402

LOCAL = {"127.0.0.1", "localhost", "::1", "[::1]"}
BAD_TYPES = ("audio/", "multipart/", "application/octet-stream")
# Dòng log của `tauri-plugin-log` (giờ địa phương): `[2026-10-03][10:00:02][INFO][…::session] bắt đầu phiên dịch 1`.
LOG_LINE = re.compile(r"^\[(\d{4}-\d{2}-\d{2})\]\[(\d{2}:\d{2}:\d{2})\]\[\w+\]\[[^\]]*::session\] "
                      r"(bắt đầu phiên dịch \d+|kết thúc phiên dịch:)")


def fold(text):
    return unicodedata.normalize("NFC", text).lower()


def when(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def allowed_path(rules, path):
    """Luật khớp dài nhất theo tiền tố đường dẫn, hay None."""
    hits = [r for r in rules if path.startswith(r["path"])]
    return max(hits, key=lambda r: len(r["path"])) if hits else None


def decoded(text):
    """Văn bản đã giải mã để so từ mồi: `%XX` và `+` (URL, form), và JSON không thoát ký tự."""
    out = [unquote_plus(text)]
    try:
        out.append(json.dumps(json.loads(text), ensure_ascii=False))
    except ValueError:
        pass
    return fold("\n".join(out))


def sessions_from_log(text, tz):
    """Các phiên dịch trong log của app: [(bắt đầu, kết thúc hay None)], giờ gắn múi `tz`."""
    out = []
    for line in text.splitlines():
        m = LOG_LINE.match(line)
        if not m:
            continue
        t = datetime.fromisoformat(f"{m.group(1)}T{m.group(2)}").replace(tzinfo=tz)
        if m.group(3).startswith("bắt đầu"):
            # Phiên trước chưa có dòng kết thúc (app bị tắt giữa phiên) thì bỏ: không biết nó dừng lúc nào.
            if out and out[-1][1] is None:
                out.pop()
            out.append((t, None))
        elif out and out[-1][1] is None:
            out[-1] = (out[-1][0], t)
    return out


def audit(har, allow, start=None, stop=None, sessions=None):
    """`sessions`: phiên trong log của app (`sessions_from_log`), hay None nếu không đối chiếu."""
    canaries = [fold(c) for c in allow.get("canaries", [])]
    entries = har["log"]["entries"]
    window = []
    if start is None or stop is None:
        window.append("thiếu mốc Bắt đầu, Dừng của phiên dịch")
    elif stop <= start:
        window.append("mốc Dừng không sau mốc Bắt đầu")
    elif sessions is not None:
        hit = [(a, b) for a, b in sessions if a < stop and (b is None or b > start)]
        if not hit:
            window.append("log của app không có phiên dịch nào trùng mốc Bắt đầu, Dừng")
        elif any(b is None for _, b in hit):
            window.append("phiên dịch trong log của app chưa có dòng kết thúc (app thoát giữa phiên?)")
        else:
            start, stop = min([start] + [a for a, _ in hit]), max([stop] + [b for _, b in hit])
    if not window and entries:
        times = sorted(when(e["startedDateTime"]) for e in entries)
        if not times[0] < start < stop < times[-1]:
            window.append("cửa sổ phiên dịch không nằm trong khoảng thời gian của nhật ký (sai múi giờ?)")
    limit = allow.get("max_body_bytes", 4096)
    violations, external, in_session = [], 0, 0
    for e in entries:
        req = e["request"]
        url = urlsplit(req["url"])
        host = url.hostname or ""
        if host in LOCAL:
            continue
        external += 1
        t = when(e["startedDateTime"])
        during = start is not None and stop is not None and start <= t <= stop
        in_session += during
        reasons = []
        rule = allowed_path(allow["hosts"].get(host, []), url.path or "/")
        if host not in allow["hosts"]:
            reasons.append("máy chủ không có trong danh sách cho phép")
        elif rule is None:
            reasons.append("đường dẫn không có trong danh sách cho phép")
        elif during and not rule.get("during_session", False):
            reasons.append("gọi trong lúc dịch mà không phải việc chạy theo lịch")
        post = req.get("postData") or {}
        body = post.get("text") or ""
        size = max(req.get("bodySize") or 0, len(body.encode("utf-8")))
        if size > limit:
            reasons.append(f"thân request {size} byte, quá {limit}")
        mime = (post.get("mimeType") or "").lower()
        if mime.startswith(BAD_TYPES):
            reasons.append(f"kiểu {mime}")
        haystack = decoded(req["url"]) + "\n" + decoded(body)
        for c in canaries:
            if c in haystack:
                reasons.append(f"có từ mồi {c!r}")
        for r in reasons:
            violations.append({"time": e["startedDateTime"], "method": req["method"], "url": req["url"], "reason": r})
    violations = [{"time": None, "method": None, "url": None, "reason": w} for w in window] + violations
    if external == 0:
        violations.append({"time": None, "method": None, "url": None,
                           "reason": "không có request ra ngoài nào: kiểm lại proxy"})
    return {"criterion": "A7", "external": external, "in_session": in_session, "violations": violations,
            "window": [start.isoformat(), stop.isoformat()] if start and stop else None, "pass": not violations}


def main(argv=None):
    ap = argparse.ArgumentParser(description="A7: kiểm nhật ký HAR của một lần thử qua proxy.")
    ap.add_argument("har")
    ap.add_argument("--allow", required=True, help="JSON: hosts, max_body_bytes, canaries")
    ap.add_argument("--start", required=True, help="lúc bấm Bắt đầu, ISO 8601 có múi giờ")
    ap.add_argument("--stop", required=True, help="lúc bấm Dừng, ISO 8601 có múi giờ")
    ap.add_argument("--app-log", required=True, help="log của app trên máy thử (app.log), để đối chiếu mốc phiên")
    ap.add_argument("--out", help="ghi kết quả JSON vào file này")
    args = ap.parse_args(argv)
    start, stop = when(args.start), when(args.stop)
    if start.tzinfo is None or stop.tzinfo is None:
        ap.error("--start, --stop phải có múi giờ, ví dụ 2026-10-10T09:00:00+07:00")
    with open(args.har, encoding="utf-8") as f:
        har = json.load(f)
    with open(args.allow, encoding="utf-8") as f:
        allow = json.load(f)
    with open(args.app_log, encoding="utf-8", errors="replace") as f:
        sessions = sessions_from_log(f.read(), start.tzinfo)
    out = audit(har, allow, start, stop, sessions)
    with open(args.har, "rb") as f:
        out["har_sha256"] = hashlib.sha256(f.read()).hexdigest()
    out.update(origin())
    if out["window"]:
        print(f"Cửa sổ phiên đã kiểm (mốc đã ghi hợp với log của app): {out['window'][0]} … {out['window'][1]}")
    print(f"Request ra ngoài: {out['external']}; trong lúc dịch: {out['in_session']}")
    for v in out["violations"]:
        print(f"VI PHẠM: {v['method'] or ''} {v['url'] or ''} — {v['reason']}".replace("  ", " "))
    print(f"A7: {'ĐẠT' if out['pass'] else 'KHÔNG ĐẠT'}")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
