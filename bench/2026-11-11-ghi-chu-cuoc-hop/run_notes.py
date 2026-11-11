"""Chạy map-reduce ghi chú cuộc họp qua `llama-server` hay API cloud và đo thời gian, RAM (spike, không vào app).

`run_job` là phần thuần (không mạng); backend local và cloud ở phía dưới."""
import copy
import json
import os
import sys
from typing import Callable

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from notes_lib import EMPTY_NOTES, chunk_lines, parse_notes, render_lines  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
LANGUAGE_NAME = {"vi": "Vietnamese", "en": "English"}


def _prompt(name: str) -> str:
    with open(os.path.join(HERE, "prompts", name), encoding="utf-8") as f:
        return f.read().rstrip("\n")


def _empty_notes() -> dict:
    notes = copy.deepcopy(EMPTY_NOTES)
    notes["_stats"] = {"refs_total": 0, "refs_invalid": 0, "owners_cleared": 0}
    return notes


def _without_stats(notes: dict) -> dict:
    return {k: v for k, v in notes.items() if k != "_stats"}


def _merge_mechanically(parts: list[dict]) -> dict:
    merged = {"summary": "\n".join(p["summary"] for p in parts), "decisions": [], "action_items": [],
              "open_questions": [], "_stats": {"refs_total": 0, "refs_invalid": 0, "owners_cleared": 0}}
    for p in parts:
        for key in ("decisions", "action_items", "open_questions"):
            merged[key].extend(p[key])
        for key, value in p["_stats"].items():
            merged["_stats"][key] += value
    return merged


def run_job(lines: list[dict], lang: str, budget: int, count_tokens: Callable[[str], int],
            call: Callable[[list[dict], int], str], max_map: int, max_reduce: int) -> dict:
    result = {"notes": None, "raw_fallback": None, "chunks": 0, "failed_chunks": 0, "reduce_fallback": False,
              "calls": []}
    language = LANGUAGE_NAME[lang]
    fix = _prompt("fix.txt")

    def ask(kind: str, prompt: str, max_tokens: int):
        """Một lượt gọi có thử lại một lần. Trả (ghi chú | None, chuỗi cuối cùng nhận được)."""
        messages = [{"role": "user", "content": prompt}]
        raw = call(messages, max_tokens)
        notes = parse_notes(raw, lines)
        valid_first = notes is not None
        if notes is None:
            retry = messages + [{"role": "assistant", "content": raw}, {"role": "user", "content": fix}]
            raw = call(retry, max_tokens)
            notes = parse_notes(raw, lines)
        result["calls"].append({"kind": kind, "valid_first": valid_first, "valid": notes is not None})
        return notes, raw

    chunks = chunk_lines(lines, budget, count_tokens)
    result["chunks"] = len(chunks)
    if not chunks:
        result["notes"] = _empty_notes()
        return result

    parts: list[dict] = []
    last_raw = ""
    for chunk in chunks:
        prompt = _prompt("map.txt").replace("{language}", language).replace("{transcript}", render_lines(chunk))
        notes, last_raw = ask("map", prompt, max_map)
        if notes is None:
            result["failed_chunks"] += 1
        else:
            parts.append(notes)

    if not parts:
        result["raw_fallback"] = last_raw
        return result
    if len(chunks) == 1 and len(parts) == 1:
        result["notes"] = parts[0]
        return result

    while len(parts) > 1:
        next_level: list[dict] = []
        i = 0
        while i < len(parts):
            group = parts[i:i + 2]
            if len(group) < 2:
                next_level.append(group[0])  # một bản lẻ đi thẳng lên tầng sau
                break
            while i + len(group) < len(parts):
                candidate = parts[i:i + len(group) + 1]
                joined = "\n".join(json.dumps(_without_stats(p), ensure_ascii=False, separators=(",", ":"))
                                   for p in candidate)
                if count_tokens(joined) > budget:
                    break
                group = candidate
            i += len(group)
            body = "\n".join(json.dumps(_without_stats(p), ensure_ascii=False, separators=(",", ":"))
                             for p in group)
            prompt = _prompt("reduce.txt").replace("{language}", language).replace("{parts}", body)
            notes, _ = ask("reduce", prompt, max_reduce)
            if notes is None:
                result["reduce_fallback"] = True
                notes = _merge_mechanically(group)
            next_level.append(notes)
        parts = next_level
    result["notes"] = parts[0]
    return result
