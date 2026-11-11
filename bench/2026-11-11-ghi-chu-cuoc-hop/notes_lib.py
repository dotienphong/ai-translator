"""Thư viện của spike ghi chú cuộc họp: đọc bản xuất Markdown của app, cắt theo phút, dựng chữ, chia đoạn,
đọc JSON ghi chú và kiểm ngôn ngữ. Chỉ dùng thư viện chuẩn."""
import re
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
