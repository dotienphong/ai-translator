"""Chọn θ và ngưỡng gộp trên phần dev, báo trên phần kiểm với đúng ngưỡng đó (kế hoạch 01, chốt tham số; spec §5.3, §5.4).
Chạy `latency-bench speaker-eval --embeddings-in` (không cần model) cho mỗi bộ ngưỡng.

cd bench/2026-10-26-nguoi-noi && python tune.py <latency-bench> <thư mục có <tên>.emb.json và <tên>.rttm> --dev a,b --test c,d [--out kết-quả.json]
(không dùng `-I`: chế độ cô lập không thêm thư mục của script vào đường dẫn nên `from score_spk import ...` không tìm thấy.)
Mục tiêu trên dev: trung bình line_all, trừ 0,03 cho mỗi giọng thừa (so với số người thật).
Hòa (lệch ≤ TIE so với mục tiêu cao nhất của cả lưới): θ thắng là θ gần 0,40 nhất (mặc định của spec lúc chọn ngưỡng; kế
hoạch 01 đã chốt 0,35, mốc phá hòa giữ 0,40 để chạy lại ra đúng kết quả đã ghi), hòa tiếp thì θ thấp hơn; ở θ đã chọn, mức gộp
thắng là mức đứng đầu nhóm hòa theo thứ tự thận trọng-trước của MERGES. Sau khi chọn, in khoảng θ và khoảng mức gộp hòa (để biết
ngưỡng có tác dụng trên dev hay không) và cảnh báo khi θ chạm mép lưới.
"""
import argparse
import itertools
import json
import os
import subprocess
import sys
import tempfile

from score_spk import read_jsonl, read_rttm, score

THETAS = [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60]
# Thận trọng trước: 1,10 là không bao giờ gộp, rồi từ gộp ít tới gộp nhiều. Hòa mục tiêu thì thắng mức đứng trước.
MERGES = [1.10, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50, 0.45]
TIE = 1e-9  # sai số coi là cùng mục tiêu
DEFAULT_THETA = 0.40  # θ mặc định của spec lúc chọn ngưỡng (nay 0,35); hòa mục tiêu thì chọn θ gần nó nhất


def check_inputs(folder, names):
    """Mọi tên phải có đủ `<tên>.emb.json` và `<tên>.rttm`; kiểm trước khi chạy lưới để lỗi không lộ ra muộn."""
    missing = [os.path.join(folder, n + ext) for n in names for ext in (".emb.json", ".rttm")
               if not os.path.isfile(os.path.join(folder, n + ext))]
    if missing:
        sys.exit("thiếu file dữ liệu:\n  " + "\n  ".join(missing))


def evaluate(binary, folder, name, theta, merge):
    # stdout của binary (dòng tóm tắt) bỏ đi; stderr để hiện ra khi binary lỗi (check=True báo thêm mã thoát).
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "ra.jsonl")
        subprocess.run(
            [binary, "speaker-eval", "--embeddings-in", os.path.join(folder, name + ".emb.json"),
             "--theta", str(theta), "--merge-theta", str(merge), "--out", out],
            check=True, stdout=subprocess.DEVNULL,
        )
        return score(read_jsonl(out), read_rttm(os.path.join(folder, name + ".rttm")))


def objective(s):
    return s["line_all"] - 0.03 * max(0, s["voices"] - s["speakers"])


def top(grid):
    """Mục tiêu cao nhất của lưới. Mọi phép "hòa" tính so với giá trị này (không so từng cặp liền kề), nên không bắc cầu sai."""
    return max(grid.values())


def tied_thetas(grid):
    """Các θ (theo thứ tự THETAS) có ít nhất một mức gộp đạt mục tiêu cao nhất của lưới, sai số TIE."""
    floor = top(grid) - TIE
    return [t for t in THETAS if any(grid[t, m] >= floor for m in MERGES)]


def tied_merges(grid, theta):
    """Các mức gộp (theo thứ tự thận trọng-trước của MERGES) ở `theta` đạt mục tiêu cao nhất của lưới, sai số TIE."""
    floor = top(grid) - TIE
    return [m for m in MERGES if grid[theta, m] >= floor]


def choose(grid):
    """`grid[(θ, gộp)]` là mục tiêu trên dev. Trả (θ, mức gộp).

    θ: trong các θ hòa mục tiêu cao nhất thì lấy θ gần DEFAULT_THETA nhất, hòa tiếp thì θ thấp hơn (khoảng cách làm tròn 9 chữ số
    để 0,35 và 0,45 thật sự bằng nhau; số thực cho 0,05000000000000004 và 0,04999999999999999). Mức gộp: phần tử đầu của nhóm hòa
    ở θ đó theo thứ tự MERGES, nên `merge_note` mô tả đúng mức này."""
    theta = min(tied_thetas(grid), key=lambda t: (round(abs(t - DEFAULT_THETA), 9), t))
    return theta, tied_merges(grid, theta)[0]


def _range_text(tied, axis, fmt, tail=""):
    """Mô tả nhóm hòa: khoảng [lo, hi] khi các phần tử đứng liền nhau trên `axis`, liệt kê (theo thứ tự trên `axis`) khi không."""
    idx = [axis.index(x) for x in tied]
    if max(idx) - min(idx) + 1 == len(idx):
        return f"trong khoảng [{fmt(min(tied))}, {fmt(max(tied))}]{tail}"
    return f"ở các mức {', '.join(fmt(x) for x in tied)} (không liền nhau){tail}"


def merge_note(values, best, chosen):
    """`values[i]` là mục tiêu trên dev của MERGES[i] ở θ đã chọn; `best` là mục tiêu cao nhất của lưới; `chosen` là mức gộp đã
    chọn (phải thuộc nhóm hòa, đúng như `choose` trả). Mô tả mức gộp có đổi kết quả hay không, ở dạng chữ để in."""
    tied = [m for m, v in zip(MERGES, values) if v >= best - TIE]
    if chosen not in tied:
        raise ValueError(f"mức gộp đã chọn {chosen} không thuộc nhóm hòa {tied}")
    if len(tied) == 1:
        return f"gộp có tác dụng: chọn {chosen:.2f}" + (" (không bao giờ gộp)" if chosen > 1 else "")
    never = " (1.10 = không bao giờ gộp)" if max(tied) > 1 else ""
    where = _range_text(tied, MERGES, lambda x: f"{x:.2f}", never)
    return f"gộp không đổi kết quả trên dev {where}; chọn mức thận trọng nhất {chosen:.2f}"


def theta_note(tied, chosen):
    """None khi chỉ một θ đạt mục tiêu cao nhất; không thì mô tả nhóm θ hòa và θ đã chọn."""
    if len(tied) == 1:
        return None
    where = _range_text(tied, THETAS, lambda x: f"{x:.2f}")
    return f"θ hòa mục tiêu trên dev {where}; chọn θ gần {DEFAULT_THETA:.2f} nhất: {chosen:.2f}"


def edge_warning(theta):
    """Cảnh báo khi θ đã chọn nằm đúng mép lưới (kết quả tốt nhất có thể ở ngoài lưới); None nếu không."""
    if theta in (min(THETAS), max(THETAS)):
        return f"θ chạm mép lưới, cân nhắc mở rộng (θ={theta:.2f}, lưới {min(THETAS):.2f}–{max(THETAS):.2f})"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("binary")
    ap.add_argument("folder")
    ap.add_argument("--dev", required=True)
    ap.add_argument("--test", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    dev, test = a.dev.split(","), a.test.split(",")
    check_inputs(a.folder, dev + test)
    grid = {}
    for theta, merge in itertools.product(THETAS, MERGES):
        grid[theta, merge] = sum(objective(evaluate(a.binary, a.folder, n, theta, merge)) for n in dev) / len(dev)
    theta, merge = choose(grid)
    best = top(grid)
    print(f"chọn trên dev: θ={theta:.2f} gộp={merge:.2f} (mục tiêu {best:.3f})")
    for line in (theta_note(tied_thetas(grid), theta), edge_warning(theta)):
        if line:
            print(f"  {line}")
    print(f"  ở θ={theta:.2f}, {merge_note([grid[theta, m] for m in MERGES], best, merge)}")
    rows = {}
    for n in dev + test:
        s = evaluate(a.binary, a.folder, n, theta, merge)
        rows[n] = s
        tag = " (dev)" if n in dev else ""
        print(f"  {n + tag:30s} dòng ≥1 s {s['line_1s']:.1%} | mọi dòng {s['line_all']:.1%} | thời lượng {s['time']:.1%}"
              f" | {s['voices']}/{s['speakers']} giọng | trần {s['purity']:.1%}")
    if a.out:
        with open(a.out, "w") as f:
            json.dump({"theta": theta, "merge": merge, "rows": rows}, f, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
