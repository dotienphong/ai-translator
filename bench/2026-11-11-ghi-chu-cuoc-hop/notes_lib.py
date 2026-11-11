"""Thư viện của spike ghi chú cuộc họp: đọc bản xuất Markdown của app, cắt theo phút, dựng chữ, chia đoạn,
đọc JSON ghi chú và kiểm ngôn ngữ. Chỉ dùng thư viện chuẩn."""
import json
import re
import unicodedata
from typing import Callable

DROPPED_MARKER = "[bỏ qua đoạn]"
UNTRANSLATED_MARKER = "(chưa dịch được)"

_CLOCK = re.compile(r"^(\d{2}):(\d{2}):(\d{2})$")
_SPEAKER = re.compile(r"^\*\*(.+?):\*\* ")
_ESCAPE = re.compile(r"\\(.)", re.S)


def _unescape(text: str) -> str:
    return _ESCAPE.sub(r"\1", text)


def _split_cells(row: str) -> list[str]:
    """Tách ô theo `|` không bị thoát; giữ nguyên ký tự thoát trong ô."""
    cells, cur, i = [], [], 0
    while i < len(row):
        ch = row[i]
        if ch == "\\" and i + 1 < len(row):
            cur.append(row[i:i + 2])
            i += 2
            continue
        if ch == "|":
            cells.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
        i += 1
    cells.append("".join(cur))
    return cells


def parse_markdown_export(md: str) -> list[dict]:
    lines: list[dict] = []
    first_abs: int | None = None
    prev_abs = 0
    day_offset = 0
    for raw in md.splitlines():
        row = raw.strip()
        if not row.startswith("|"):
            continue
        cells = _split_cells(row)
        # `| a | b | c |` cho ['', ' a ', ' b ', ' c ', '']
        if len(cells) < 4:
            continue
        cells = cells[1:-1] if cells[-1].strip() == "" else cells[1:]
        m = _CLOCK.match(cells[0].strip())
        if not m:
            continue  # dòng tiêu đề và dòng kẻ của bảng
        secs = int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3])
        absolute = day_offset + secs
        if absolute < prev_abs:
            day_offset += 86400
            absolute = day_offset + secs
        prev_abs = absolute
        if first_abs is None:
            first_abs = absolute

        src_cell = cells[1].strip() if len(cells) > 1 else ""
        tgt_cell = cells[2].strip() if len(cells) > 2 else ""
        speaker = None
        sm = _SPEAKER.match(src_cell)
        if sm:
            speaker = _unescape(sm[1])
            src_cell = src_cell[sm.end():]
        src = _unescape(src_cell).strip()
        tgt = _unescape(tgt_cell).strip()
        lines.append({
            "seq": len(lines) + 1,
            "t": absolute - first_abs,
            "speaker": speaker,
            "src": src,
            "tgt": None if tgt in ("", UNTRANSLATED_MARKER) else tgt,
            "dropped": src == DROPPED_MARKER,
        })
    return lines


def prefix(lines: list[dict], minutes: int) -> list[dict]:
    return [l for l in lines if l["t"] <= minutes * 60]


def line_text(line: dict) -> str | None:
    if line["dropped"]:
        return None
    return line["tgt"] or line["src"]


def render_lines(lines: list[dict]) -> str:
    out = []
    for line in lines:
        text = line_text(line)
        if text is None:
            continue
        who = f"{line['speaker']}: " if line["speaker"] else ""
        out.append(f"[{line['seq']}] {who}{text}\n")
    return "".join(out)


def chunk_lines(lines: list[dict], budget: int, count_tokens: Callable[[str], int]) -> list[list[dict]]:
    chunks: list[list[dict]] = []
    cur: list[dict] = []
    used = 0
    for line in lines:
        if line["dropped"]:
            continue
        cost = count_tokens(render_lines([line]))
        if cur and used + cost > budget:
            chunks.append(cur)
            cur, used = [], 0
        cur.append(line)
        used += cost
    if cur:
        chunks.append(cur)
    return chunks


EMPTY_NOTES = {"summary": "", "decisions": [], "action_items": [], "open_questions": []}

_THINK = re.compile(r"<think>.*?</think>", re.S)


def _first_object(text: str) -> str | None:
    """Đoạn từ `{` đầu tiên tới `}` khớp ngoặc của nó; ngoặc trong chuỗi JSON không tính."""
    start = text.find("{")
    if start < 0:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return None


def _clean_refs(refs, valid: set[int], stats: dict) -> list[int]:
    if not isinstance(refs, list):
        return []
    kept: set[int] = set()
    for ref in refs:
        stats["refs_total"] += 1
        n = None
        if isinstance(ref, int) and not isinstance(ref, bool):
            n = ref
        elif isinstance(ref, str) and ref.strip().isdigit():
            n = int(ref.strip())
        if n is None or n not in valid:
            stats["refs_invalid"] += 1
        else:
            kept.add(n)
    return sorted(kept)


def _text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def parse_notes(raw: str, lines: list[dict]) -> dict | None:
    obj_text = _first_object(_THINK.sub("", raw))
    if obj_text is None:
        return None
    try:
        data = json.loads(obj_text)
    except ValueError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("summary"), str):
        return None
    for key in ("decisions", "action_items", "open_questions"):
        if not isinstance(data.get(key), list):
            return None

    valid = {l["seq"] for l in lines if not l["dropped"]}
    speakers = {l["speaker"].lower() for l in lines if l["speaker"]}
    texts = [t.lower() for t in (line_text(l) for l in lines) if t]
    stats = {"refs_total": 0, "refs_invalid": 0, "owners_cleared": 0}

    def owner_known(name: str) -> bool:
        low = name.lower()
        return low in speakers or any(low in t for t in texts)

    out = {"summary": data["summary"].strip(), "decisions": [], "action_items": [], "open_questions": []}
    for key in ("decisions", "open_questions"):
        for item in data[key]:
            if not isinstance(item, dict) or not _text(item.get("text")):
                continue
            out[key].append({"text": _text(item["text"]), "refs": _clean_refs(item.get("refs"), valid, stats)})
    for item in data["action_items"]:
        if not isinstance(item, dict) or not _text(item.get("text")):
            continue
        owner = _text(item.get("owner"))
        if owner and not owner_known(owner):
            owner = ""
            stats["owners_cleared"] += 1
        out["action_items"].append({"text": _text(item["text"]), "owner": owner, "due": _text(item.get("due")),
                                    "refs": _clean_refs(item.get("refs"), valid, stats)})
    out["_stats"] = stats
    return out


def _is_cjk(ch: str) -> bool:
    cp = ord(ch)
    return (0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF or 0x3040 <= cp <= 0x30FF
            or 0xAC00 <= cp <= 0xD7AF or 0x1100 <= cp <= 0x11FF)


def _is_accented(ch: str) -> bool:
    return ch in "đĐ" or any(unicodedata.combining(c) for c in unicodedata.normalize("NFD", ch))


def lang_ok(notes: dict, lang: str) -> bool:
    parts = [notes.get("summary", "")]
    for key in ("decisions", "action_items", "open_questions"):
        parts += [item.get("text", "") for item in notes.get(key, [])]
    letters = [c for c in "".join(parts) if c.isalpha()]
    if not letters:
        return True
    total = len(letters)
    if sum(_is_cjk(c) for c in letters) / total > 0.05:
        return False
    if lang == "vi":
        return sum(_is_accented(c) for c in letters) / total >= 0.10
    if lang == "en":
        return sum(ord(c) > 127 for c in letters) / total <= 0.05
    raise ValueError(f"ngôn ngữ không hỗ trợ: {lang}")
