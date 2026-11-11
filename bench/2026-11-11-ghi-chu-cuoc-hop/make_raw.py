"""Dựng `$DATA/raw/<lang>-{chuan,nhe}.md` từ nguồn chữ (không qua âm thanh): cắt câu, gán giờ theo tốc độ nói, dịch
từng câu bằng model dịch của app qua `llama-server` với đúng prompt và tham số của app (`crates/pipeline`), rồi ghi theo
định dạng "Xuất Markdown" của app (`src-tauri/src/transcript/export.rs`). Xem `results/bo-thu.md` về lý do và giới hạn.

Chạy: python -I make_raw.py --data $DATA [--only en,zh] ; chạy lại thì dịch tiếp chỗ dở (bộ đệm ở `$DATA/raw/cache`)."""
import argparse
import ast
import concurrent.futures
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # `python -I` không tự thêm thư mục script
from run_notes import DEFAULT_SERVER, REPO, LocalServer, data_dir, http_json, norm_path

# Ký tự mỗi giây khi nói (để gán giờ; 60 phút của bộ thử tính theo số này).
RATE = {"en": 14.0, "vi": 12.0, "zh": 5.0, "ja": 4.5, "ko": 5.0}
GAP = 0.3  # giây nghỉ giữa hai câu
EN_NAME = {"en": "English", "vi": "Vietnamese", "zh": "Chinese", "ja": "Japanese", "ko": "Korean"}
CN_NAME = {"en": "英语", "vi": "越南语", "zh": "中文", "ja": "日语", "ko": "韩语"}
PACKS = {"chuan": ("Hy-MT2-1.8B-Q8_0.gguf", 61), "nhe": ("Hy-MT2-1.8B-Q4_K_M.gguf", 31)}  # file model, số phút cần dịch
UNTRANSLATED = "(chưa dịch được)"
MAX_LINE = {"en": 200, "vi": 220, "zh": 70, "ja": 120, "ko": 120}


def translation_prompt(text: str, src: str, tgt: str) -> str:
    """Như `pipeline::prompt::translation_prompt` (mẫu Hy-MT2)."""
    if "zh" in (src, tgt):
        return f"将以下文本翻译为{CN_NAME[tgt]}，注意只需要输出翻译后的结果，不要额外解释：\n\n{text}"
    return (f"Translate the following text into {EN_NAME[tgt]}. Note that you should only output the translated "
            f"result without any additional explanation:\n\n{text}")


def split_long(text: str, limit: int, seps: str) -> list[str]:
    """Cắt đoạn dài hơn `limit` tại dấu trong `seps`; không có dấu thì để nguyên."""
    out, cur = [], ""
    for piece in re.findall(rf"[^{re.escape(seps)}]*[{re.escape(seps)}]?\s*", text):
        if not piece:
            continue
        if cur and len(cur) + len(piece) > limit:
            out.append(cur.strip())
            cur = ""
        cur += piece
    if cur.strip():
        out.append(cur.strip())
    return out


def sentences(text: str, lang: str) -> list[str]:
    ends = ".?!" if lang in ("en", "vi") else "。？！?!"
    parts = [p.strip() for p in re.findall(rf"[^{re.escape(ends)}]*[{re.escape(ends)}]+\s*|[^{re.escape(ends)}]+$", text)]
    out: list[str] = []
    for p in parts:
        if not p:
            continue
        # câu rất ngắn ("Yeah.") dính vào câu trước cùng lượt nói, như bộ cắt câu của app gom tiếng đệm
        if out and len(p) < 12 and len(out[-1]) + len(p) < MAX_LINE[lang]:
            out[-1] = f"{out[-1]} {p}" if lang in ("en", "vi") else out[-1] + p
            continue
        if len(p) > MAX_LINE[lang]:
            out.extend(split_long(p, MAX_LINE[lang], ",;" if lang in ("en", "vi") else "，、；,"))
        else:
            out.append(p)
    return out


def clean_icsi(text: str) -> str:
    text = re.sub(r"\{[a-z]+\}", " ", text)                     # {disfmarker}, {vocalsound}, {pause}…
    text = re.sub(r"\s+([,.?!;:])", r"\1", text)                 # "Yeah ." → "Yeah."
    text = re.sub(r"(\w) (n't|'re|'s|'m|'ve|'ll|'d)\b", r"\1\2", text)
    text = re.sub(r"\s+-\s+", "-", text)                         # "twenty - fourth"
    text = re.sub(r"([,.?!])(?:\s*[,.])+", r"\1", text)          # dấu thừa sau khi bỏ marker
    return re.sub(r"\s+", " ", text).strip(" ,")


def load_en(src: str, index: int) -> tuple[list[tuple[str, str]], str]:
    with open(os.path.join(src, "qmsum_academic_test.jsonl"), encoding="utf-8") as f:
        meeting = json.loads(f.readlines()[index])
    out = []
    for turn in meeting["meeting_transcripts"]:
        text = clean_icsi(turn["content"])
        if not re.search(r"\w", text):
            continue
        out.extend((turn["speaker"], s) for s in sentences(text, "en"))
    return out, f"QMSum data/Academic/jsonl/test.jsonl, dòng {index + 1} (cuộc họp ICSI)"


def load_zh(src: str) -> tuple[list[tuple[str, str]], str]:
    best = None
    with open(os.path.join(src, "vcsum_context.txt"), encoding="utf-8") as f:
        for row in f:
            d = json.loads(row)
            turns, speakers = (ast.literal_eval(v) if isinstance(v, str) else v for v in (d["context"], d["speaker"]))
            chars = sum(len(s) for t in turns for s in t)
            if not (20000 <= chars <= 32000) or len(set(speakers)) < 4 or len(turns) != len(speakers):
                continue
            # nhiều lượt lời nhất = giống cuộc họp nhất (ít độc thoại)
            if best is None or len(turns) > len(best[0]):
                best = (turns, speakers, d["id"], chars)
    if best is None:
        sys.exit("VCSum: không có cuộc họp nào hợp điều kiện")
    turns, speakers, vid, chars = best
    out = []
    for turn, who in zip(turns, speakers):
        for s in turn:
            s = s.strip()
            if s:
                out.extend((f"Người nói {who}", p) for p in sentences(s, "zh"))
    return out, f"VCSum overall_context.txt id {vid} ({chars} chữ, {len(set(speakers))} người nói, {len(turns)} lượt lời)"


def load_jsonl(src: str, lang: str) -> tuple[list[tuple[str, str]], str]:
    out = []
    with open(os.path.join(src, f"{lang}.jsonl"), encoding="utf-8") as f:
        for row in f:
            if row.strip():
                d = json.loads(row)
                out.append((d["speaker"], d["text"].strip()))
    return out, f"{lang}.jsonl (tự viết cho bộ thử, có đáp án ở {lang}.gold.json)"


def with_times(lines: list[tuple[str, str]], lang: str) -> list[dict]:
    t, out = 0.0, []
    for who, text in lines:
        out.append({"t": t, "speaker": who, "src": text})
        t += len(text) / RATE[lang] + GAP
    return out


def escape_markdown(text: str) -> str:
    return "".join("\\" + c if c in "\\|*_`[]<>#~" else (" " if c in "\n\r" else c) for c in text)


def clock(seconds: float) -> str:
    s = 9 * 3600 + int(seconds)
    return f"{s // 3600 % 24:02d}:{s // 60 % 60:02d}:{s % 60:02d}"


def translate_all(lines: list[dict], src: str, tgt: str, cache_path: str, exe: str, model: str) -> dict[int, str | None]:
    done: dict[int, str | None] = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            for row in f:
                d = json.loads(row)
                if d["src"] == lines[d["i"]]["src"]:
                    done[d["i"]] = d["tgt"]
    todo = [i for i in range(len(lines)) if i not in done]
    if not todo:
        return done
    with LocalServer(exe, model, 8192, "gpu", ["-np", "4"]) as srv:
        # LocalServer đặt `-np 1` trước; tham số sau thắng.
        base = f"http://127.0.0.1:{srv.port}"

        def one(i: int) -> tuple[int, str | None]:
            text = lines[i]["src"]
            prompt = translation_prompt(text, src, tgt)
            n = len(http_json(f"{base}/tokenize", {"content": text}, {}, 120)["tokens"])
            for penalty in (1.05, 1.15):  # app: thử lại một lần với repeat penalty cao hơn
                body = {"messages": [{"role": "user", "content": prompt}], "temperature": 0.0,
                        "repeat_penalty": penalty, "max_tokens": min(4 * n + 32, 512)}
                choice = http_json(f"{base}/v1/chat/completions", body, {}, 600)["choices"][0]
                out = (choice["message"].get("content") or "").strip()
                if out and choice.get("finish_reason") != "length":
                    return i, " ".join(out.split())
            return i, None

        with open(cache_path, "a", encoding="utf-8") as f, concurrent.futures.ThreadPoolExecutor(4) as pool:
            for n, (i, tgt_text) in enumerate(pool.map(one, todo), 1):
                done[i] = tgt_text
                f.write(json.dumps({"i": i, "src": lines[i]["src"], "tgt": tgt_text}, ensure_ascii=False) + "\n")
                f.flush()
                if n % 50 == 0:
                    print(f"  {os.path.basename(cache_path)}: {n}/{len(todo)}", flush=True)
    return done


def model_path(data: str, name: str) -> str:
    """Model dịch: ở `$DATA/models`, không có thì lấy bản app đang dùng ở `models/` của repo."""
    for folder in (os.path.join(data, "models"), os.path.join(REPO, "models")):
        if os.path.exists(os.path.join(folder, name)):
            return os.path.join(folder, name)
    sys.exit(f"Thiếu model dịch {name}")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--data")
    ap.add_argument("--only", default="en,zh,ja,ko,vi")
    ap.add_argument("--en-index", type=int, default=0)
    ap.add_argument("--server")
    args = ap.parse_args()
    data = data_dir(args.data)
    src_dir, raw_dir = os.path.join(data, "src"), os.path.join(data, "raw")
    os.makedirs(os.path.join(raw_dir, "cache"), exist_ok=True)
    exe = norm_path(args.server or DEFAULT_SERVER)
    for lang in args.only.split(","):
        if lang == "en":
            pairs, source = load_en(src_dir, args.en_index)
        elif lang == "zh":
            pairs, source = load_zh(src_dir)
        else:
            pairs, source = load_jsonl(src_dir, lang)
        lines = with_times(pairs, lang)
        tgt = "en" if lang == "vi" else "vi"
        minutes = lines[-1]["t"] / 60
        print(f"{lang}: {len(lines)} câu, {minutes:.1f} phút, nguồn: {source}", flush=True)
        if minutes < 60:
            print(f"CẢNH BÁO {lang}: chưa đủ 60 phút", file=sys.stderr)
        for pack, (model, need_min) in PACKS.items():
            part = [l for l in lines if l["t"] <= need_min * 60]
            done = translate_all(part, lang, tgt, os.path.join(raw_dir, "cache", f"{lang}-{pack}.jsonl"), exe,
                                 model_path(data, model))
            rows = ["# Bản chép lời · 2026-11-11 09:00\n\n| Giờ | Câu gốc | Bản dịch |\n|---|---|---|\n"]
            failed = 0
            for i, l in enumerate(part):
                t = done[i]
                failed += t is None
                rows.append(f"| {clock(l['t'])} | **{escape_markdown(l['speaker'])}:** {escape_markdown(l['src'])} | "
                            f"{escape_markdown(t if t is not None else UNTRANSLATED)} |\n")
            with open(os.path.join(raw_dir, f"{lang}-{pack}.md"), "w", encoding="utf-8", newline="\n") as f:
                f.write("".join(rows))
            print(f"  {lang}-{pack}.md: {len(part)} câu, {failed} câu chưa dịch được", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
