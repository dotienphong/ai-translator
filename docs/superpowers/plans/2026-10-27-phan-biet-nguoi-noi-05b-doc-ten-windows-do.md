# Phân biệt người nói, kế hoạch 05b: gói Windows, ghi cây và đo trên máy Windows, chốt công thức

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **KHÔNG commit, KHÔNG push** (như file 05). Mọi thay đổi để ở working tree; mỗi Task kết thúc bằng "Mốc kiểm". Không chạy `git add/commit/push/stash/reset/checkout/clean/rebase`.
>
> **Không chạy gì trên máy Mac này liên quan Teams, Chrome, Edge, Zoom của người dùng.** Việc cần đọc app thật là Task **(cần chủ dự án)**: chạy trên máy Windows của chủ dự án; phía Mac chỉ chạy hai khách tự động của kế hoạch 01 (Chrome hồ sơ tạm, `guests.py`), **báo chủ dự án trước** khi chạy (máy đang được dùng; micro giả không phát ra loa).

**Goal:** (1) dựng gói chạy cho máy Windows; (2) ghi cây giao diện thật của Teams (rồi Meet, Zoom) trên Windows và đo chi phí đọc; (3) từ bản ghi đó chốt công thức Teams Windows, đưa vào bản build sẵn **chỉ khi** đạt tiêu chí, kèm fixture ẩn danh và test độ khớp; (4) quyết bật hay giữ tắt Meet, Zoom trên Windows; (5) cập nhật spec và kết quả. **Không giả vờ có số liệu:** mọi Task cần máy Windows ghi rõ "chờ chủ dự án", và chưa có bản ghi thì công thức Windows giữ ở dạng ứng viên, bộ đọc Windows không chạy (file 05, QĐ 6, 8).

**Architecture:** không thêm mã lớn. Dùng lại bộ đọc và công cụ của file 05 (`uia-record`, `make_fixture.py`, `LiveReader`) và bộ test cây ghi sẵn của 04 (`tiles_of`, `agreement` của `names::track`). Việc mới: gói chạy (`chay-05.ps1`), hai công cụ phân tích Python (`$B/windows/`), test độ khớp cho fixture Windows, và các quyết định theo số đo.

**Tech Stack:** như file 05 (không thêm crate; Python 3 với thư viện chuẩn, chạy `-I`). PowerShell 5.1 trên máy Windows (đã có sẵn).

**Spec:** như file 05, thêm §7.3 (kiểm tra tự động hằng ngày trên Windows: kế hoạch 06), §11, §12 (A-spk3, A-spk5), §13 mục 5.

**Dựa trên:** file 05 (Task 0–8 đã đạt). Gói đo i5 của kế hoạch 02b (`$DATA/win-pack-02.zip`) vẫn **chưa chạy** (chờ chủ dự án): lần ngồi máy Windows này nên chạy cả hai (file 05, QĐ 16).

**Quy ước:** như file 05 (biến `W`, `DATA`, `B`; `cd $W &&` đầu mọi lệnh; `CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0`; kiểm đĩa trước build nặng; repo công khai: không đường dẫn cá nhân, không tên người thật; Windows build bằng mingw, không `cargo-xwin`). Thêm: bản ghi cây có tên thật (`cay-*.jsonl`) và thư mục `$DATA/out/05/` **không bao giờ vào repo**; chỉ fixture ẩn danh đã được duyệt (Task 11 Step 8).

---

### Task 9: Gói Windows `win-pack-05` **(làm trên Mac)**

**Files:**
- Create: `$DATA/win-pack-05-nguon/{chay-05.ps1, DOC-05.txt, lam-goi-05.sh}`, `$DATA/win-pack-05/`, `$DATA/win-pack-05.zip`
- Create: `$B/windows/{tom_tat_do.py, liet_ke_hinh_dang.py, test_windows_tools.py}`
- Create: `$B/results/05-windows.md`
- Modify: `$B/truoc-spec/doc-ten/run_schedule.py` (chế độ `-`: không chạy `axtrace`)

- [ ] **Step 1: Công cụ phân tích bản ghi Windows (Python, thư viện chuẩn)** — `$B/windows/tom_tat_do.py` (tóm tắt số liệu của `uia-record stats`), `liet_ke_hinh_dang.py` (liệt kê hình dạng không in chữ, lọc theo nhãn, đo độ trễ của một lớp sau lúc bật mic) và test. Test trước:

```python
"""cd bench/2026-10-26-nguoi-noi/windows && python3 -I -B test_windows_tools.py : kiểm hai công cụ phân tích bản ghi Windows."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import re  # noqa: E402

from liet_ke_hinh_dang import onsets, table  # noqa: E402
from tom_tat_do import summarize  # noqa: E402


def row(depth, role, ident="", cls="", title=""):
    return f"{depth}|{role}||{title}|||{ident}||" + f"|{cls}"


class ToolsTest(unittest.TestCase):
    def test_summary_counts_passes_statuses_and_slow_ones(self):
        rows = [
            {"t": 1, "pass": "Full", "ms": 12.0, "elements": 80, "status": "Ok", "tiles": 3, "timeouts": 0, "denied": 0},
            {"t": 2, "pass": "Fast", "ms": 40.0, "elements": 9, "status": "Ok", "tiles": 3, "timeouts": 1, "denied": 0},
            {"t": 3, "pass": "Idle", "ms": 0.1, "elements": 0, "status": "NoMeeting", "tiles": 0, "timeouts": 0, "denied": 2},
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8") as f:
            f.write("\n".join(json.dumps(r) for r in rows) + "\n")
        try:
            text = summarize(f.name)
        finally:
            os.unlink(f.name)
        self.assertIn("3 lượt", text)
        self.assertIn("lượt đầy đủ: 1 lượt, p50 12.0 ms", text)
        self.assertIn("quá 30 ms: 1", text)
        self.assertIn("NoMeeting 1, Ok 2", text)
        self.assertIn("lệnh quá hạn: 1, bị chặn: 2", text)

    def test_shape_table_hides_text_and_counts_snapshots(self):
        snaps = [
            {"t": 0.0, "lines": [row(0, "Window", title="Tên người"), row(1, "MenuItem", cls="fui-Flex", title="Lan, muted")]},
            {"t": 1.0, "lines": [row(0, "Window"), row(1, "MenuItem", cls="fui-Flex"), row(2, "Group", cls="vdi-frame-occlusion")]},
        ]
        seen, count, depth = table(snaps)
        self.assertEqual(seen[("MenuItem", "", "", "fui-Flex")], 2)
        self.assertEqual(seen[("Group", "", "", "vdi-frame-occlusion")], 1)
        self.assertEqual(depth[("Group", "", "", "vdi-frame-occlusion")], {2})

    def test_label_filter_keeps_only_matching_shapes(self):
        snaps = [{"t": 0.0, "lines": [row(1, "MenuItem", cls="fui-Flex", title="Lan, Context menu is available"), row(1, "Button", title="Chat")]}]
        seen, _, _ = table(snaps, re.compile(r"Context menu"))
        self.assertEqual(list(seen), [("MenuItem", "", "", "fui-Flex")])

    def test_onset_is_the_first_appearance_after_each_switch_on(self):
        snaps = [{"t": 100.0 + 0.5 * i, "lines": [row(1, "Group", cls="vdi-frame-occlusion")] if 3 <= i < 8 else [row(1, "Group")]} for i in range(12)]
        truth = {"steps": [{"t": 101.0, "g": "Lan", "on": True}, {"t": 103.0, "g": "Lan", "on": False}]}
        got = onsets(snaps, "vdi-frame-occlusion", truth)
        self.assertEqual(list(got), ["Lan"])
        self.assertAlmostEqual(got["Lan"][0], 0.5, places=3)


if __name__ == "__main__":
    unittest.main()
```

Run: `cd $B/windows && python3 -I -B test_windows_tools.py 2>&1 | tail -3`
Expected: lỗi `ModuleNotFoundError: No module named 'liet_ke_hinh_dang'`.

`$B/windows/tom_tat_do.py`:

```python
"""Tóm tắt bản ghi số liệu của `uia-record stats` (kế hoạch 05): mỗi dòng {"t", "pass", "ms", "elements", "status", "tiles",
"timeouts", "denied"}, không có tên người. In số lượt, thời gian lượt đầy đủ và nhanh (p50, p90, lớn nhất), số lượt quá 30 ms, số lệnh
đọc p90, phân bố trạng thái và số ô, số lệnh quá hạn và bị chặn.

python3 -I tom_tat_do.py <do-*.jsonl>...
"""
import json
import sys
from collections import Counter


def quantile(values, p):
    if not values:
        return 0.0
    v = sorted(values)
    return v[round((len(v) - 1) * p)]


def summarize(path):
    rows = [json.loads(line) for line in open(path, encoding="utf-8") if line.strip()]
    full = [r["ms"] for r in rows if r["pass"] == "Full"]
    fast = [r["ms"] for r in rows if r["pass"] == "Fast"]
    elements = [r["elements"] for r in rows if r["pass"] in ("Full", "Fast")]
    out = [f"== {path}: {len(rows)} lượt"]
    for name, v in (("đầy đủ", full), ("nhanh", fast)):
        out.append(
            f"  lượt {name}: {len(v)} lượt, p50 {quantile(v, 0.5):.1f} ms, p90 {quantile(v, 0.9):.1f}, lớn nhất {max(v, default=0.0):.1f}"
        )
    over = sum(1 for ms in full + fast if ms > 30.0)
    out.append(f"  quá 30 ms: {over}; lệnh đọc p90: {quantile(elements, 0.9):.0f}, lớn nhất {max(elements, default=0)}")
    out.append("  trạng thái: " + ", ".join(f"{k} {v}" for k, v in sorted(Counter(r["status"] for r in rows).items())))
    out.append("  số ô: " + ", ".join(f"{k} ô × {v}" for k, v in sorted(Counter(r["tiles"] for r in rows).items())))
    out.append(f"  lệnh quá hạn: {sum(r['timeouts'] for r in rows)}, bị chặn: {sum(r.get('denied', 0) for r in rows)}")
    return "\n".join(out)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        print(summarize(p))
```

`$B/windows/liet_ke_hinh_dang.py`:

```python
"""Liệt kê HÌNH DẠNG (vai trò, vai trò phụ, id, lớp) trong bản ghi cây của `uia-record fixture` (kế hoạch 05), để chọn công thức:
mỗi hình dạng một dòng, kèm số ảnh chụp có nó, số dòng trung bình mỗi ảnh và độ sâu. Không in chữ (tên, nhãn). Với
`--onset <lớp> --truth <truth.json>`: độ trễ từ lúc mỗi khách bật mic tới lúc dòng có lớp đó xuất hiện (trong ảnh chụp đầu tiên sau
lúc bật mà ảnh chụp liền trước chưa có), theo từng khách; dùng bản ghi thô (`t` là giờ Unix), không dùng fixture đã ẩn danh.

`--khop <regex>`: chỉ xét dòng có `title` hay `desc` khớp mẫu (để tìm hình dạng của ô theo nhãn của nó mà không in nhãn).

python3 -I liet_ke_hinh_dang.py <cay-*.jsonl> [--min-anh 1] [--khop <regex>] [--onset <lớp> --truth <truth.json>]
"""
import argparse
import json
import re
import statistics
from collections import defaultdict


def fields(line):
    f = line.split("|", 9)
    return f if len(f) == 10 else None


def shape_of(f):
    return (f[1], f[2], f[6] or f[8], " ".join(sorted(f[9].split())))


def table(snaps, label=None):
    seen = defaultdict(int)
    count = defaultdict(list)
    depth = defaultdict(set)
    for s in snaps:
        per = defaultdict(int)
        for line in s["lines"]:
            f = fields(line)
            if f is None:
                continue
            if label is not None and not (label.search(f[3]) or label.search(f[4])):
                continue
            k = shape_of(f)
            per[k] += 1
            depth[k].add(int(f[0]))
        for k, n in per.items():
            seen[k] += 1
            count[k].append(n)
    return seen, count, depth


def onsets(snaps, token, truth):
    """`t` của ảnh chụp (bản ghi thô của `uia-record fixture`) và của sự thật đều là giờ Unix: so trực tiếp."""
    has = [any(token in (fields(x) or [""] * 10)[9].split() for x in s["lines"]) for s in snaps]
    out = defaultdict(list)
    for step in sorted(truth["steps"], key=lambda s: s["t"]):
        if not step["on"]:
            continue
        for i in range(1, len(snaps)):
            if snaps[i]["t"] >= step["t"] and has[i] and not has[i - 1]:
                out[step["g"]].append(snaps[i]["t"] - step["t"])
                break
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fixture")
    ap.add_argument("--min-anh", type=int, default=1)
    ap.add_argument("--khop")
    ap.add_argument("--onset")
    ap.add_argument("--truth")
    a = ap.parse_args()
    snaps = [json.loads(line) for line in open(a.fixture, encoding="utf-8") if line.strip()]
    if a.onset:
        truth = json.load(open(a.truth, encoding="utf-8"))
        for g, v in sorted(onsets(snaps, a.onset, truth).items()):
            print(f"{g}: {len(v)} lần, trung vị {statistics.median(v):.2f} s, lớn nhất {max(v):.2f} s")
        return
    seen, count, depth = table(snaps, re.compile(a.khop) if a.khop else None)
    print(f"{len(snaps)} ảnh chụp")
    for k in sorted(seen, key=lambda k: (-seen[k], k)):
        if seen[k] < a.min_anh:
            continue
        role, sub, ident, cls = k
        d = sorted(depth[k])
        print(f"{seen[k]:5d} ảnh, {statistics.mean(count[k]):5.1f}/ảnh, sâu {d[0]}–{d[-1]}  {role}|{sub}|{ident}|{cls}")


if __name__ == "__main__":
    main()
```

Run: `cd $B/windows && python3 -I -B test_windows_tools.py 2>&1 | tail -3`
Expected: `Ran 4 tests` rồi `OK`.

- [ ] **Step 2: `run_schedule.py` chạy kịch bản mà không ghi cây trên Mac** — khi `<bundle-id>` là `-`, chỉ chạy kịch bản nói của hai khách và ghi `out/<tag>-truth.json` (cây do máy Windows ghi). Ba chỗ:

Trong `bench/2026-10-26-nguoi-noi/truoc-spec/doc-ten/run_schedule.py`, thay

```python
python run_schedule.py <bundle-id> <tag> <phím bật/tắt mic> [interval]
Ghi out/<tag>-watch.jsonl (axtrace watch) và out/<tag>-truth.json (thời điểm bật/tắt tiếng từng khách).
"""
```

bằng

```python
python run_schedule.py <bundle-id> <tag> <phím bật/tắt mic> [interval]
Ghi out/<tag>-watch.jsonl (axtrace watch) và out/<tag>-truth.json (thời điểm bật/tắt tiếng từng khách).
`<bundle-id>` là `-`: không chạy axtrace (máy khác ghi cây, ví dụ `uia-record` trên Windows, kế hoạch 05); chỉ chạy kịch bản và ghi
out/<tag>-truth.json (giờ Unix của máy này: đồng hồ hai máy phải khớp dưới 0,2 s).
"""
```

Trong `bench/2026-10-26-nguoi-noi/truoc-spec/doc-ten/run_schedule.py`, thay

```python
    watch = subprocess.Popen([AX, "watch", bundle, os.path.join(HERE, "out", f"{tag}-watch.jsonl"), interval])
    time.sleep(1.0)
```

bằng

```python
    watch = None
    if bundle != "-":
        watch = subprocess.Popen([AX, "watch", bundle, os.path.join(HERE, "out", f"{tag}-watch.jsonl"), interval])
        time.sleep(1.0)
```

Trong `bench/2026-10-26-nguoi-noi/truoc-spec/doc-ten/run_schedule.py`, thay

```python
    watch.terminate()
    watch.wait()
```

bằng

```python
    if watch is not None:
        watch.terminate()
        watch.wait()
```

Run: `cd $B/truoc-spec/doc-ten && python3 -I -B -c "import ast,sys; ast.parse(open('run_schedule.py', encoding='utf-8').read()); print('cú pháp ok')" && git -C $W status --short -- bench | head -5`
Expected: `cú pháp ok`; không có `__pycache__` mới.

- [ ] **Step 3: Nguồn của gói** — ba file ở `$DATA/win-pack-05-nguon/` (ngoài repo; lệnh `mkdir -p $DATA/win-pack-05-nguon` trước). `chay-05.ps1` (ghi cây và đo chi phí; chỉ gọi `uia-record.exe`, không có lệnh mạng, không cần quyền quản trị):

```powershell
# chay-05.ps1
# Ghi cây giao diện và đo chi phí đọc của bộ đọc tên người nói trên Windows (AI Translator, kế hoạch Phân biệt người nói, kế hoạch 05).
# Chỉ ĐỌC cửa sổ cuộc họp bằng UI Automation: không bấm, không gõ, không ghi âm, không dùng mạng, không cần quyền quản trị.
#
#   powershell -ExecutionPolicy Bypass -File .\chay-05.ps1 -App teams -Che ghi -Giay 120
#   powershell -ExecutionPolicy Bypass -File .\chay-05.ps1 -App teams -Che do  -Giay 60
#
#   -App   teams | zoom | meet_chrome | meet_edge
#   -Che   ghi: ghi cây giao diện (cay-*.jsonl, tối đa 4 ảnh chụp mỗi giây, CÓ TÊN NGƯỜI VÀ CHỮ TRONG CỬA SỔ HỌP) và số liệu đọc (do-*.jsonl, không có tên) trong
#               lúc khách thử nói; do: đo chi phí đọc (CPU của app họp và của uia-record) ở ba mức: không đọc, 1 lần/giây, 4 lần/giây.
#   -Giay  số giây mỗi lần ghi hay đo (mặc định 120 cho ghi, 60 cho đo)
#
# Chạy được trên Windows PowerShell 5.1.

param(
    [Parameter(Mandatory = $true)][ValidateSet('teams', 'zoom', 'meet_chrome', 'meet_edge')][string]$App,
    [ValidateSet('ghi', 'do')][string]$Che = 'ghi',
    [int]$Giay = 0
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$OutputEncoding = [System.Text.Encoding]::UTF8

$here = $PSScriptRoot
if (-not $here) { $here = (Get-Location).Path }
Set-Location -LiteralPath $here
if ($Giay -le 0) { if ($Che -eq 'ghi') { $Giay = 120 } else { $Giay = 60 } }

$recipeOf = @{
    'teams'       = 'teams-windows.recipes.json'
    'zoom'        = 'zoom-windows-explore.recipes.json'
    'meet_chrome' = 'meet-windows.recipes.json'
    'meet_edge'   = 'meet-windows.recipes.json'
}
$processesOf = @{
    'teams'       = @('ms-teams', 'msedgewebview2')
    'zoom'        = @('Zoom')
    'meet_chrome' = @('chrome')
    'meet_edge'   = @('msedge', 'msedgewebview2')
}
$recipe = $recipeOf[$App]
$exe = Join-Path $here 'uia-record.exe'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $here ('chay-05-' + $App + '-' + $Che + '.txt')
if (Test-Path -LiteralPath $logPath) { Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue }

function Log($s) {
    Write-Host $s
    Add-Content -LiteralPath $logPath -Value ([string]$s) -Encoding UTF8
}

function UnixNow() {
    return [math]::Round(([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) / 1000.0, 3)
}

foreach ($f in @('uia-record.exe', $recipe)) {
    if (-not (Test-Path -LiteralPath (Join-Path $here $f))) {
        Log ('THIẾU file: ' + $f + '. Hãy giải nén ĐẦY ĐỦ gói rồi chạy lại trong thư mục đã giải nén.')
        exit 1
    }
}
try {
    Get-ChildItem -LiteralPath $here -File | ForEach-Object {
        try { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue } catch { }
    }
} catch { }

# Thông số máy (không có tên người dùng, tên máy hay địa chỉ).
$infoPath = Join-Path $here 'thong-tin-may-05.txt'
try {
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $os = Get-CimInstance Win32_OperatingSystem
    $cs = Get-CimInstance Win32_ComputerSystem
    $lines = @(
        ('CPU: ' + $cpu.Name),
        ('Lõi/luồng: ' + $cpu.NumberOfCores + '/' + $cpu.NumberOfLogicalProcessors),
        ('RAM (GB): ' + [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)),
        ('Windows: ' + $os.Caption + ' ' + $os.Version + ' (build ' + $os.BuildNumber + ')'),
        ('Nguồn điện: ' + (Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | ForEach-Object { 'pin ' + $_.BatteryStatus }))
    )
    Set-Content -LiteralPath $infoPath -Value $lines -Encoding UTF8
} catch { Log ('Không ghi được thông số máy: ' + $_.Exception.Message) }

function CpuSeconds($names) {
    $total = 0.0
    foreach ($n in $names) {
        Get-Process -Name $n -ErrorAction SilentlyContinue | ForEach-Object {
            try { $total += $_.TotalProcessorTime.TotalSeconds } catch { }
        }
    }
    return $total
}

if ($Che -eq 'ghi') {
    Write-Host ''
    Write-Host ('GHI CÂY GIAO DIỆN: ' + $App + ', ' + $Giay + ' giây.') -ForegroundColor Green
    Write-Host 'Cửa sổ cuộc họp phải đang mở và hiện rõ. Bảng "People" mở hay đóng theo lượt ghi (xem DOC-05.txt).'
    Write-Host 'Chỉ bấm Enter khi Claude báo "bắt đầu kịch bản" ở máy Mac.' -ForegroundColor Yellow
    [void](Read-Host 'Enter để bắt đầu')
    $fixture = 'cay-' + $App + '-' + $stamp + '.jsonl'
    $stats = 'do-' + $App + '-' + $stamp + '.jsonl'
    $t0 = UnixNow
    Log ('Bắt đầu (giờ Unix, giây): ' + $t0)
    $p1 = Start-Process -FilePath $exe -ArgumentList @('fixture', $App, $fixture, '--rate', '4', '--seconds', "$Giay", '--recipe', $recipe) -NoNewWindow -PassThru
    $p2 = Start-Process -FilePath $exe -ArgumentList @('stats', $App, $stats, '--rate', '4', '--seconds', "$Giay", '--recipe', $recipe, '--calibrate') -NoNewWindow -PassThru
    # Giữ handle để đọc được ExitCode sau khi tiến trình thoát (lỗi đã biết của Windows PowerShell 5.1 với -PassThru).
    $null = $p1.Handle
    $null = $p2.Handle
    $p1.WaitForExit()
    $p2.WaitForExit()
    $t1 = UnixNow
    Log ('Kết thúc (giờ Unix, giây): ' + $t1)
    Log ('Mã thoát: fixture ' + $p1.ExitCode + ', stats ' + $p2.ExitCode)
    Set-Content -LiteralPath (Join-Path $here ('moc-' + $App + '-' + $stamp + '.txt')) -Value @("bat dau $t0", "ket thuc $t1") -Encoding ASCII
    $zip = Join-Path $here ('ket-qua-05-ghi-' + $App + '-' + $stamp + '.zip')
    $files = @($fixture, $stats, ('moc-' + $App + '-' + $stamp + '.txt'), 'thong-tin-may-05.txt', (Split-Path -Leaf $logPath)) |
        Where-Object { Test-Path -LiteralPath (Join-Path $here $_) } | ForEach-Object { Join-Path $here $_ }
    Compress-Archive -LiteralPath $files -DestinationPath $zip -Force
    Write-Host ''
    Write-Host ('XONG. Gửi lại file: ' + (Split-Path -Leaf $zip)) -ForegroundColor Green
    Write-Host ('Lưu ý: ' + $fixture + ' có tên người tham dự và chữ trong cửa sổ họp; chỉ gửi cho Claude, không đăng ở đâu khác.')
    exit 0
}

# Che = do: chi phí đọc.
Write-Host ''
Write-Host ('ĐO CHI PHÍ ĐỌC: ' + $App + ', mỗi mức ' + $Giay + ' giây. Cửa sổ cuộc họp phải đang mở; ĐỪNG thao tác gì khác trong lúc đo.') -ForegroundColor Green
$targets = $processesOf[$App]
$summary = @()
$levels = @(
    @{ Nhan = 'khong-doc'; Rate = 0 },
    @{ Nhan = '1-lan-giay'; Rate = 1 },
    @{ Nhan = '4-lan-giay'; Rate = 4 }
)
foreach ($lv in $levels) {
    $label = $lv.Nhan
    Write-Host ('--- ' + $label + ' ---')
    $before = CpuSeconds $targets
    $own = 0.0
    if ($lv.Rate -eq 0) {
        Start-Sleep -Seconds $Giay
    } else {
        $out = 'do-' + $App + '-' + $label + '-' + $stamp + '.jsonl'
        $p = Start-Process -FilePath $exe -ArgumentList @('stats', $App, $out, '--rate', "$($lv.Rate)", '--seconds', "$Giay", '--recipe', $recipe) -NoNewWindow -PassThru
        $null = $p.Handle
        $p.WaitForExit()
        try { $own = $p.TotalProcessorTime.TotalSeconds } catch { }
    }
    $after = CpuSeconds $targets
    $delta = $after - $before
    $line = '{0}: app họp dùng thêm {1:N2} giây CPU trong {2} giây ({3:N1}% một lõi); uia-record dùng {4:N2} giây CPU' -f $label, $delta, $Giay, (100.0 * $delta / $Giay), $own
    Log $line
    $summary += $line
}
$zip = Join-Path $here ('ket-qua-05-do-' + $App + '-' + $stamp + '.zip')
$files = Get-ChildItem -LiteralPath $here -File | Where-Object { $_.Name -like ('do-' + $App + '-*-' + $stamp + '.jsonl') -or $_.Name -eq 'thong-tin-may-05.txt' -or $_.FullName -eq $logPath } | ForEach-Object { $_.FullName }
Compress-Archive -LiteralPath $files -DestinationPath $zip -Force
Write-Host ''
Write-Host ('XONG. Gửi lại file: ' + (Split-Path -Leaf $zip)) -ForegroundColor Green
exit 0
```

`DOC-05.txt` (hướng dẫn tiếng Việt cho chủ dự án):

```text
GHI CÂY GIAO DIỆN VÀ ĐO CHI PHÍ ĐỌC TÊN NGƯỜI NÓI TRÊN WINDOWS (đọc cái này trước)
=================================================================================

Việc này để làm gì
------------------
Bộ đọc tên người nói của AI Translator đọc cây giao diện (UI Automation) của cửa sổ cuộc họp Teams, Meet, Zoom để biết ai đang nói.
Trên Windows, ta CHƯA biết cây giao diện của các app này trông ra sao (tên loại điều khiển, id, lớp). Gói này ghi lại cây đó trong một
cuộc họp thử có khách thử do Claude cho vào từ máy Mac, và đo bộ đọc tốn bao nhiêu CPU. Công cụ chỉ ĐỌC: không bấm, không gõ, không
ghi âm, không dùng mạng, không cần quyền quản trị. Nó chỉ chạm vào cửa sổ cuộc họp, không đọc cửa sổ nào khác.

Lưu ý riêng tư (quan trọng)
---------------------------
- File cay-*.jsonl có MỌI CHỮ đang hiện trong cửa sổ cuộc họp: tên người tham dự và cả tin nhắn chat nếu khung chat đang mở. Chỉ dùng
  cuộc họp thử với khách thử (Lan, Minh), ĐÓNG khung chat, không dùng cuộc họp thật. Chỉ gửi file này cho Claude, không đăng ở đâu khác.
- File do-*.jsonl và chi-phi (trong chay-05-*.txt) không có tên người hay chữ nào của cửa sổ họp.

Trong gói có gì
---------------
  uia-record.exe                        công cụ ghi và đo (chỉ đọc)
  chay-05.ps1                           script chạy
  teams-windows.recipes.json            công thức ĐOÁN cho Teams (từ bản ghi trên Mac); chưa chắc đúng, chính bản ghi này để sửa nó
  meet-windows.recipes.json             như trên, cho Meet trên Chrome và Edge
  zoom-windows-explore.recipes.json     như trên, cho Zoom (chỉ để tìm cửa sổ họp và ghi cây)
  uia-probe.exe, DOC-TEAMS-MEET.txt     công cụ ghi cây cũ (dự phòng, không cần dùng nếu uia-record chạy được)

Chuẩn bị (một lần)
------------------
1. CẮM ĐIỆN, chọn chế độ nguồn hiệu suất cao. Tắt việc nặng khác. Không để máy ngủ hay khóa màn hình trong lúc ghi.
2. Giải nén ĐẦY ĐỦ gói (chuột phải, Extract All) vào thư mục ngắn, ví dụ C:\win-pack-05. Không chạy từ trong cửa sổ zip.
3. Đồng hồ hai máy phải khớp dưới 0,2 giây: mở PowerShell (không cần quyền quản trị cũng được) chạy  w32tm /resync  rồi nhìn giờ Windows
   so với giờ Mac. Nếu lệch, báo Claude.
4. Mở PowerShell ngay tại thư mục đã giải nén (mở thư mục trong File Explorer, bấm vào thanh địa chỉ, gõ  powershell  rồi Enter).

Ghi cây Teams (Task 10 của kế hoạch 05; làm cùng Claude)
-------------------------------------------------------
Cần: Teams bản cài trên Windows (Teams mới, ms-teams.exe), tài khoản Microsoft cá nhân, máy Mac của Claude cho khách vào.
a) Mở "Meet now" bằng Teams, TẮT camera, để mic TẮT, gửi đường dẫn mời cho Claude. Claude cho Lan và Minh vào; bạn bấm Admit.
b) Lượt 1 (bảng People MỞ): mở bảng People, đóng khung chat. Chạy:

     powershell -ExecutionPolicy Bypass -File .\chay-05.ps1 -App teams -Che ghi -Giay 120

   Khi Claude báo "bắt đầu kịch bản" thì bấm Enter. Chờ tới dòng "XONG". Gửi file ket-qua-05-ghi-teams-*.zip.
c) Lượt 2 (bảng People ĐÓNG): đóng bảng People rồi chạy lại đúng lệnh trên. Gửi file zip mới.
d) Đo chi phí đọc (không cần khách nói; vẫn để cuộc họp mở, bảng People đóng):

     powershell -ExecutionPolicy Bypass -File .\chay-05.ps1 -App teams -Che do -Giay 60

   Mất khoảng 3 phút (ba mức, mỗi mức 60 giây). ĐỪNG thao tác trong lúc đo. Gửi file ket-qua-05-do-teams-*.zip.

Meet (Chrome hay Edge) và Zoom: làm sau, theo hướng dẫn của Claude (cùng lệnh, đổi  -App meet_chrome  hay  -App meet_edge  hay  -App zoom).

Nếu gặp sự cố
-------------
- "THIẾU file": giải nén chưa đầy đủ; giải nén lại ra thư mục mới.
- uia-record báo "không khởi tạo được UI Automation": chạy lại; nếu vẫn lỗi, gửi dòng báo lỗi cho Claude.
- Cây rỗng hay không thấy cửa sổ họp (file cay-*.jsonl chỉ có {"t":..,"lines":[]}): cửa sổ họp đang thu nhỏ hay tiêu đề lạ. Chạy
    .\uia-probe.exe list
  gửi cho Claude các dòng của ms-teams.exe (tiêu đề cửa sổ) để Claude chỉnh công thức.
- Windows SmartScreen chặn .exe: chọn "More info" rồi "Run anyway"; script đã gỡ dấu "tải từ Internet" cho mọi file.
- Bộ diệt virus xóa uia-record.exe: báo Claude (công cụ do chính Claude dựng, không có mã mạng).
```

`lam-goi-05.sh` (dựng `win-pack-05/` và `win-pack-05.zip`; text ghi UTF-8 có BOM và CRLF vì Windows PowerShell 5.1 đọc `.ps1` không BOM theo bảng mã ANSI, hỏng dấu tiếng Việt):

```bash
#!/bin/bash
# Dựng gói Windows của kế hoạch 05 ở $DATA/win-pack-05/ và $DATA/win-pack-05.zip (kế hoạch 05, Task 9). Cần: kế hoạch 05 Task 6, 7, 8 đã
# dựng `uia-record.exe` bằng mingw (target gnu, profile release của repo). Text (.ps1, .txt) ghi UTF-8 có BOM, xuống dòng CRLF, như các
# gói trước (Windows PowerShell 5.1 đọc .ps1 không BOM theo bảng mã ANSI, hỏng dấu tiếng Việt).
# Đặt biến W (gốc worktree), DATA (thư mục dữ liệu ngoài repo) trước khi chạy.
set -euo pipefail
: "${W:?đặt W}" "${DATA:?đặt DATA}"
G=$W/target/x86_64-pc-windows-gnu/release
F=$W/scripts/speaker-recipes/fixtures
P=$DATA/win-pack-05
rm -rf "$P"
mkdir -p "$P"
cp "$G/uia-record.exe" "$P/"
for f in teams-windows meet-windows zoom-windows-explore; do cp "$F/$f.recipes.json" "$P/"; done
cp "$DATA/win-pack/uia-probe.exe" "$DATA/win-pack/DOC-TEAMS-MEET.txt" "$P/"
for f in chay-05.ps1 DOC-05.txt; do
  python3 -I -c '
import sys
s = open(sys.argv[1], encoding="utf-8").read().lstrip("\ufeff").replace("\r\n", "\n").replace("\n", "\r\n")
open(sys.argv[2], "w", encoding="utf-8-sig", newline="").write(s)
' "$DATA/win-pack-05-nguon/$f" "$P/$f"
done
cmp "$G/uia-record.exe" "$P/uia-record.exe"
n=$(ls "$P" | wc -l | tr -d ' ')
[ "$n" = 8 ] || { echo "SAI: $n file (cần 8)"; exit 1; }
rm -f "$DATA/win-pack-05.zip"
(cd "$P" && zip -q -X "$DATA/win-pack-05.zip" $(ls))
unzip -l "$DATA/win-pack-05.zip"
ls -l "$DATA/win-pack-05.zip"
shasum -a 256 "$DATA/win-pack-05.zip"
(cd "$P" && shasum -a 256 $(ls)) > "$DATA/win-pack-05-nguon/sha256-cac-file.txt"
cat "$DATA/win-pack-05-nguon/sha256-cac-file.txt"
```

- [ ] **Step 4: Kiểm nguồn, dựng gói**

Run: `cd $W && export W DATA && bash -n $DATA/win-pack-05-nguon/lam-goi-05.sh && echo "bash ok" && python3 -I - <<'PY'
import os, re
s = open(os.path.join(os.environ["DATA"], "win-pack-05-nguon", "chay-05.ps1"), encoding="utf-8").read()
t = re.sub(r"'[^']*'", "''", s)
t = re.sub(r'"[^"]*"', '""', t)
t = re.sub(r"#.*", "", t)
for a, b in ("()", "{}", "[]"):
    print(a + b, t.count(a), t.count(b))
PY`
Expected: `bash ok`; ba cặp ngoặc `() {} []` mỗi cặp hai số **bằng nhau** (bản thử khi viết kế hoạch: 71/71, 39/39, 16/16). Máy này không có PowerShell: script **chưa chạy thử**, chỉ cân ngoặc.

Run: `cd $W && export W DATA && ls target/x86_64-pc-windows-gnu/release/uia-record.exe && bash $DATA/win-pack-05-nguon/lam-goi-05.sh 2>&1 | tail -16`
Expected: danh sách 8 file (`uia-record.exe`, ba file `*.recipes.json`, `uia-probe.exe`, `DOC-TEAMS-MEET.txt`, `chay-05.ps1`, `DOC-05.txt`), cỡ `win-pack-05.zip`, SHA-256 của zip và từng file (ghi vào `$DATA/win-pack-05-nguon/sha256-cac-file.txt`). Thiếu `uia-record.exe` thì làm lại Task 8 Step 4.

Run: `cd $W && head -c 3 $DATA/win-pack-05/chay-05.ps1 | xxd | head -1; file $DATA/win-pack-05/chay-05.ps1 $DATA/win-pack-05/DOC-05.txt; rm -rf $DATA/plan05-kiem && mkdir $DATA/plan05-kiem && (cd $DATA/plan05-kiem && unzip -q ../win-pack-05.zip && ls | wc -l && cmp uia-record.exe $W/target/x86_64-pc-windows-gnu/release/uia-record.exe && echo "exe khớp") ; rm -rf $DATA/plan05-kiem`
Expected: `efbb bf` (BOM UTF-8); `UTF-8 (with BOM) text, with CRLF line terminators` cho cả hai; `8`; `exe khớp`.

- [ ] **Step 5: Ghi kết quả dựng vào `$B/results/05-windows.md`** — tạo file với nội dung dưới đây, điền các số đo thật của Task 8 Step 4 (cỡ `.exe`, danh sách DLL, cỡ xz) và SHA-256 của zip vào bảng; các mục còn lại **giữ nguyên chữ "chờ chủ dự án"** cho tới khi có số:

~~~markdown
# Windows: bộ đọc tên UI Automation (kế hoạch 05)

Mục tiêu: trên Windows, đọc tên và chỉ báo "đang nói" của Teams (rồi Meet, Zoom) bằng UI Automation; đo chi phí đọc; chốt công thức.
**Chưa có bản ghi cây giao diện Windows nào trước kế hoạch này.** Công thức Windows ở dạng ứng viên (đoán từ macOS) cho tới Task 11.

## Dựng (Task 8, Task 9; macOS, mingw-w64)

| | |
|---|---|
| `speaker-worker.exe` (gnu, release, strip) | <cỡ byte> |
| bản nén xz -9e | <byte>; bộ cài 0.3.1 + bản nén = <byte> (giới hạn 60 000 000) |
| `uia-record.exe` | <byte> |
| DLL nhập của `speaker-worker.exe` | <danh sách; mới so với 02-windows.md: ole32.dll, user32.dll> |
| nhập `ws2_32`, `winhttp`, `wininet`, `wsock` | 0 |
| `win-pack-05.zip` | <byte>, SHA-256 <chuỗi> |

Gói chưa chạy trên Windows (máy dựng không có PowerShell); `chay-05.ps1` chỉ cân ngoặc.

## Task 10: bản ghi Teams trên Windows

**Chờ chủ dự án.**

## Task 11: công thức Teams Windows

**Chờ bản ghi Task 10.**

## Task 12: chi phí đọc

**Chờ bản ghi Task 10.**

## Task 13: Meet (Chrome, Edge) và Zoom trên Windows

**Chờ chủ dự án.**
~~~

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && python3 -I -B $B/windows/test_windows_tools.py 2>&1 | tail -1 && git status --short | wc -l && ls $B/windows | grep -c pycache`
Expected: `OK`; số dòng `git status` thêm `$B/windows/*`, `$B/results/05-windows.md` và sửa `run_schedule.py`; `0`. Không commit.

---

### Task 10: Ghi cây Teams trên Windows và đo chi phí **(cần chủ dự án)**

Khoảng 2 giờ, cần máy Windows có Teams bản cài (Teams mới, `ms-teams.exe`), tài khoản Microsoft cá nhân, và máy Mac này cho hai khách. **Không giả vờ có số liệu:** nếu chưa làm thì mục này của `05-windows.md` giữ "chờ chủ dự án" và các Task 11, 12 không bắt đầu.

**Files:** không sửa mã. Kết quả vào `$DATA/out/05/` (ngoài repo), tóm tắt (không tên người) vào `$B/results/05-windows.md`.

- [ ] **Step 1: Báo và chuẩn bị (Mac)** — báo chủ dự án giờ chạy (máy Mac đang được dùng: khách là Chrome hồ sơ tạm, micro giả không ra loa). Chuẩn bị môi trường Python của kế hoạch 01 và hai khách:

Run: `cd $B && test -x $DATA/venv/bin/python && $DATA/venv/bin/python -I -c "import playwright; print('playwright ok')"; ls truoc-spec/doc-ten/guests.py truoc-spec/doc-ten/audio | head -4`
Expected: `playwright ok` và các file của kế hoạch 01. Thiếu môi trường thì chạy `$B/setup_env.sh` (kế hoạch 01), không tự cài gì khác.

- [ ] **Step 2: Chủ dự án chuẩn bị máy Windows** — gửi `$DATA/win-pack-05.zip` (SHA-256 ở `$DATA/win-pack-05-nguon/sha256-cac-file.txt`) sang máy Windows; giải nén đầy đủ; làm đúng mục "Chuẩn bị" của `DOC-05.txt` (cắm điện, đồng hồ khớp dưới 0,2 s bằng `w32tm /resync`, đóng khung chat). Chủ dự án chạy riêng, **cùng lần ngồi máy**, gói 02b (`win-pack-02.zip`, `chay-tat-ca.ps1`) nếu chưa chạy.

- [ ] **Step 3: Lượt 1, bảng People mở** — theo mục "Ghi cây Teams" của `DOC-05.txt`: chủ dự án mở "Meet now", tắt mic và camera, gửi đường dẫn mời; khách Lan, Minh vào bằng `guests.py` như kế hoạch 01 Task 12 (`/open`, `/fill`, `/click`; chủ dự án bấm Admit). Chủ dự án chạy `chay-05.ps1 -App teams -Che ghi -Giay 120` và báo "bắt đầu" ở Enter; ngay khi nhận báo, phía Mac chạy kịch bản nói (không ghi cây trên Mac):

Run: `cd $B/truoc-spec/doc-ten && $DATA/venv/bin/python -I run_schedule.py - teams-win-people-open 'sel:#mic-button[aria-label="Unmute mic"]||#mic-button[aria-label="Mute mic"]' 2>&1 | tail -2`
(Chuỗi bật/tắt mic của khách Teams là đúng chuỗi đã dùng ở kế hoạch 01 Task 12; Teams web đổi giao diện thì xem `results/teams-chrome.md` rồi sửa.) Expected: `xong teams-win-people-open: … s, 26 lần bật/tắt`; `out/teams-win-people-open-truth.json` có `steps`.

Chủ dự án gửi lại `ket-qua-05-ghi-teams-*.zip`. Giải nén vào `$DATA/out/05/teams-win-people-open/` và chép `truth.json` vào cùng thư mục.

- [ ] **Step 4: Lượt 2, bảng People đóng** — chủ dự án đóng bảng People, chạy lại đúng lệnh; phía Mac chạy lại kịch bản với tag `teams-win-people-closed`. Giải nén vào `$DATA/out/05/teams-win-people-closed/`.

- [ ] **Step 5: Đo chi phí đọc** — theo `DOC-05.txt`: chủ dự án chạy `chay-05.ps1 -App teams -Che do -Giay 60` (không cần khách nói; bảng People đóng; đừng thao tác trong lúc đo); gửi `ket-qua-05-do-teams-*.zip`; giải nén vào `$DATA/out/05/teams-win-do/`.

- [ ] **Step 6: Mô tả điều kiện, không tên người** — ghi vào `$B/results/05-windows.md`, mục Task 10: máy (từ `thong-tin-may-05.txt`: CPU, RAM, bản Windows), bản Teams (chủ dự án đọc ở Teams › Settings › About), nguồn điện, ngày, số lượt ghi, "bảng People mở/đóng", điều gì không làm được. Quét không có tên người, địa chỉ email, đường dẫn cá nhân:

Run: `cd $W && grep -nE "/User[s]/|C:\\\\User[s]|@[a-z0-9-]+\.[a-z]{2,}" $B/results/05-windows.md | head -3; echo "quét xong"`
Expected: chỉ `quét xong`.

- [ ] **Step 7: Mốc kiểm**

Run: `cd $W && ls $DATA/out/05/ && git status --short -- $B/results | head -3`
Expected: ba thư mục (`teams-win-people-open`, `teams-win-people-closed`, `teams-win-do`) hoặc ghi rõ cái nào chưa có; chỉ `05-windows.md` đổi trong repo. **Không có file `cay-*.jsonl` nào trong repo.** Không commit.

---

### Task 11: Chốt công thức Teams Windows từ bản ghi **(làm trên Mac, sau Task 10)**

**Files:**
- Modify: `scripts/speaker-recipes/fixtures/teams-windows.recipes.json` (chỉnh theo bản ghi)
- Create: `scripts/speaker-recipes/fixtures/teams-windows-people-{closed,open}.jsonl`, `…truth.json` (sau khi duyệt)
- Modify: `scripts/speaker-recipes/fixtures/README.md`, `crates/speaker-worker/src/reader/tree.rs`, `crates/speaker-worker/src/reader/extract.rs`, `crates/speaker-worker/src/names/track.rs` (test)
- Modify (chỉ khi đạt tiêu chí): `scripts/speaker-recipes/recipes.json`, `crates/speaker-recipe/src/lib.rs` (test)

**Tiêu chí bật Teams trên Windows** (như tiêu chí của 04 cho Teams macOS, hơi chặt hơn vì chưa có Windows thử lần nào): (a) bộ đọc tìm đủ ba người (hai khách và chủ phòng) ở ≥ 95% ảnh chụp của **cả hai** bản ghi; (b) khung "đang nói" khớp sự thật từng khách ≥ 0,85 ở **cả hai** bản ghi (`MIN_WINDOWS_AGREEMENT`); (c) không đọc chữ ngoài phạm vi (test `texts_read` của 04 vẫn đạt với cây Windows: Task 11 Step 9). Không đạt thì **giữ tắt**: không sửa `recipes.json`, ghi lý do vào `05-windows.md`, chủ dự án quyết (mục 1 của "Điều cần chủ dự án quyết"). Không hạ ngưỡng để đạt.

- [ ] **Step 1: Chuẩn bị và kiểm bản ghi**

Run: `cd $W && ls $DATA/out/05/teams-win-people-open $DATA/out/05/teams-win-people-closed && for d in open closed; do f=$(ls $DATA/out/05/teams-win-people-$d/cay-teams-*.jsonl | head -1); echo "$d: $(wc -l < $f) ảnh chụp, $(head -1 $f | python3 -I -c 'import json,sys; print(len(json.loads(sys.stdin.read())["lines"]))') dòng ở ảnh đầu"; done`
Expected: mỗi thư mục có `cay-teams-*.jsonl`, `do-teams-*.jsonl`, `moc-teams-*.txt`, `thong-tin-may-05.txt`, `truth.json`; vài trăm tới vài nghìn dòng ở ảnh đầu; số ảnh chụp tối đa 480 (4 ảnh/giây × 120 s), ít hơn nếu mỗi lần chụp cả cây mất hơn 250 ms (ghi số thật; dưới 100 ảnh chụp thì báo chủ dự án). Ảnh đầu **không có dòng nào** (`0 dòng`) nghĩa là bộ đọc không thấy cửa sổ họp: đi Step 3 nhánh A.

- [ ] **Step 2: Số liệu đọc, không tên người**

Run: `cd $W && for d in open closed; do python3 -I -B $B/windows/tom_tat_do.py $DATA/out/05/teams-win-people-$d/do-teams-*.jsonl; done`
Expected: mỗi bản ghi một khối: số lượt, p50/p90 thời gian lượt đầy đủ và nhanh, số lượt quá 30 ms, lệnh đọc p90, phân bố trạng thái (`Ok` là chính), **số ô** (mong đợi `3 ô × phần lớn lượt`), lệnh quá hạn, bị chặn. Ghi các số này vào `05-windows.md` mục Task 10. Trạng thái toàn `NoMeeting` hay `0 ô × mọi lượt`: Step 3 nhánh A. Có `bị chặn > 0`: Teams chạy quyền cao hơn công cụ (hay UI Automation bị chặn): ghi, dừng Task 11, báo chủ dự án.

- [ ] **Step 3: Nếu công thức đoán không khớp: tìm hình dạng thật** (làm khi Step 2 cho 0 ô hay ít hơn 3 ô; bỏ qua nếu đã có 3 ô)

Nhánh A (không thấy cửa sổ họp): xem tiêu đề cửa sổ ở dòng đầu mỗi ảnh chụp của `cay-*.jsonl` (hay `uia-probe.exe list` mà chủ dự án gửi), rồi sửa `window_title` trong `teams-windows.recipes.json` cho khớp (chỉ mẫu **dạng** tiêu đề, không tên người, không mã cuộc họp). Chạy lại Step 2 **không cần máy Windows**: `uia-record` ghi lại cây đã có, nhưng số liệu `do-*.jsonl` là của công thức cũ; vì vậy Step 4–6 dùng cây ghi sẵn (`cay-*.jsonl`) làm đầu vào, không dùng `do-*.jsonl`.

Nhánh B (thấy cửa sổ nhưng không đủ ô): tìm hình dạng của ô theo nhãn của nó (không in nhãn):

Run: `cd $W && f=$(ls $DATA/out/05/teams-win-people-closed/cay-teams-*.jsonl | head -1); python3 -I -B $B/windows/liet_ke_hinh_dang.py $f --khop "Context menu|muted|Muted" | head -20`
Expected: vài dòng `N ảnh, M/ảnh, sâu a–b  <role>|<subrole>|<id>|<lớp>`: hình dạng nào có đúng ~3 phần tử mỗi ảnh (hai khách và chủ phòng) và có mặt ở gần mọi ảnh là hình dạng của ô. Sửa `tile.role` (và `class_token` nếu cần) trong `teams-windows.recipes.json`; nhãn dạng khác "Tên, Context menu is available" thì sửa `tile.label` (nhóm `name`, `muted`, `self`) cho khớp **dạng** nhãn đọc được (xem nhãn bằng mắt trong `cay-*.jsonl`, trên máy bạn, không ghi ra file nào).

Nút rời cuộc gọi: liệt kê hình dạng có id chứa `hangup`, `leave`, `end`:

Run: `cd $W && python3 -I -B $B/windows/liet_ke_hinh_dang.py $f | grep -iE "hangup|leave|end-call|call-end" | head`
Expected: một id ổn định ở gần mọi ảnh → `confirm_id`. Không có id nào như vậy thì **bỏ `confirm_id`** khỏi công thức (cửa sổ họp chỉ nhận theo tiêu đề); ghi lại trong `05-windows.md` (mất một lớp xác nhận).

- [ ] **Step 4: Chỉ báo "đang nói" và độ trễ**

Run: `cd $W && f=$(ls $DATA/out/05/teams-win-people-closed/cay-teams-*.jsonl | head -1); $DATA/venv/bin/python -I $B/find_indicators.py $f $DATA/out/05/teams-win-people-closed/truth.json --top 6 2>&1 | cut -c1-160 | head -20`
Expected: với mỗi khách vài dòng `+0,NN  <dòng cây>` tương quan cao nhất. **Dòng in ra có thể chứa tên người: chỉ xem trên terminal, không dán vào file nào.** Phần tử có tương quan cao (≥ 0,6) và không có chữ là chỉ báo; ghi vai trò và lớp. Với Teams macOS đó là phần tử con không tên của ô, lớp `vdi-frame-occlusion`, vai trò `Group`; trên Windows có thể giống hoặc khác. Đặt `speaking[0].anchor` theo kết quả (`scope: child`, `role`, `class_token`; hay `id_prefix`).

Độ trễ từ lúc bật mic tới lúc chỉ báo xuất hiện (lớp lấy từ kết quả trên; thay `<lớp>` bằng lớp đó):

Run: `cd $W && $DATA/venv/bin/python -I -B $B/windows/liet_ke_hinh_dang.py $f --onset "<lớp>" --truth $DATA/out/05/teams-win-people-closed/truth.json`
Expected: mỗi khách một dòng `Lan: N lần, trung vị X s, lớn nhất Y s`. Đặt `delay_ms` = trung vị chung của hai khách, làm tròn 50 ms (Teams macOS: 900 ms ứng với 0,76–1,28 s). Ghi vào `05-windows.md`.

- [ ] **Step 5: Ẩn danh bản ghi** — `make_fixture.py` đã nhận cây Windows (file 05, Task 7). Dựng ánh xạ tên (không in tên), rồi từng bản ghi; tiêu đề cửa sổ họp thay bằng tên giả (`--title`) để không lộ tiêu đề cuộc họp:

Run: `cd $W && P=$B/../../scripts/speaker-recipes && mkdir -p $DATA/fixtures-review && for d in open closed; do f=$(ls $DATA/out/05/teams-win-people-$d/cay-teams-*.jsonl | head -1); cp $f $DATA/out/05/teams-win-people-$d/watch.jsonl; done && python3 -I -B $P/make_fixture.py names $DATA/fixture-names-win.json $DATA/out/05/teams-win-people-open/watch.jsonl $DATA/out/05/teams-win-people-closed/watch.jsonl && for d in open closed; do python3 -I -B $P/make_fixture.py build $DATA/out/05/teams-win-people-$d/watch.jsonl $DATA/out/05/teams-win-people-$d/truth.json $DATA/fixtures-review/teams-windows-people-$d.jsonl --names $DATA/fixture-names-win.json --window "^(Meeting|Cuộc họp)" --seconds 60 --title "Meeting with Hoa Phạm"; done; ls -l $DATA/fixtures-review/teams-windows-*`
Expected: `N tên trong ánh xạ → …` (N ≥ 1; **không in tên**); mỗi bản ghi `K ảnh chụp, L dòng, B byte, M id giả → …`; hai file `.jsonl` và hai `.truth.json` trong `$DATA/fixtures-review/`; **không** có dòng `không ghi file:` (có thì: còn một mẫu cấm, như email, liên kết, UUID, `C:\User[s]`, tên thật; sửa `make_fixture.py` hay bản ghi, **dừng, báo**: không chép tay). Nếu tiêu đề cửa sổ của Teams Windows không khớp `--window` (Step 3 nhánh A) thì dùng mẫu ở `window_title` đã chỉnh.

- [ ] **Step 6: Duyệt bản in (người điều phối hay chủ dự án)** — in các chuỗi khác nhau theo từng trường của cả hai fixture; **chỉ chép vào repo sau khi được duyệt**:

Run: `cd $W && python3 -I -B scripts/speaker-recipes/make_fixture.py review $DATA/fixtures-review/teams-windows-people-closed.jsonl $DATA/fixtures-review/teams-windows-people-open.jsonl > $DATA/fixtures-review/teams-windows-review.txt; wc -l $DATA/fixtures-review/teams-windows-review.txt; grep -ciE "@|http|\\\\User[s]|/User[s]/" $DATA/fixtures-review/teams-windows-review.txt`
Expected: bản in vài trăm dòng; dòng cuối `0`. Người duyệt đọc `teams-windows-review.txt` và xác nhận: mọi tên là tên giả (`Lan`, `Minh`, `Hoa Phạm`, `Hoa`), không có email, liên kết, id tài khoản, mã cuộc họp, đường dẫn, chữ chat. Chưa duyệt thì dừng ở đây (Task 11 chưa xong; ghi vào `05-windows.md`).

- [ ] **Step 7: Chép fixture vào repo, thêm test (đỏ)** — sau khi duyệt:

Run: `cd $W && cp $DATA/fixtures-review/teams-windows-people-closed.jsonl $DATA/fixtures-review/teams-windows-people-closed.truth.json $DATA/fixtures-review/teams-windows-people-open.jsonl $DATA/fixtures-review/teams-windows-people-open.truth.json scripts/speaker-recipes/fixtures/ && ls scripts/speaker-recipes/fixtures | grep windows`
Expected: bảy file `*windows*` (ba công thức ứng viên, bốn file fixture).

Cập nhật bảng trong `scripts/speaker-recipes/fixtures/README.md` (hai dòng mới, ghi máy và bản Teams từ `05-windows.md`):

```markdown
| `teams-windows-people-closed.jsonl`, `teams-windows-people-open.jsonl` | bản ghi `uia-record fixture` của kế hoạch 05 Task 10 (Teams <bản> trên Windows <bản Windows>, bảng People đóng / mở) | 60 s đầu; tên giả |
| `teams-windows.recipes.json`, `meet-windows.recipes.json`, `zoom-windows-explore.recipes.json` | công thức Windows: Teams chỉnh theo bản ghi; Meet, Zoom còn là ứng viên **đoán** | `meet-…`, `zoom-…` chỉ cho test và `uia-record --recipe` |
```

Thêm ba chỗ test (đỏ cho tới Step 8): danh sách fixture của `reader::tree`, tên ô của `reader::extract`, ô đủ ba người ở ≥ 95% ảnh chụp, và độ khớp của `names::track`:

Trong `crates/speaker-worker/src/reader/tree.rs`, thay

```rust
            "teams-macos-people-open.jsonl",
            "meet-chrome-macos.jsonl",
            "zoom-macos-synthetic.jsonl",
        ] {
```

bằng

```rust
            "teams-macos-people-open.jsonl",
            "meet-chrome-macos.jsonl",
            "zoom-macos-synthetic.jsonl",
            "teams-windows-people-closed.jsonl",
            "teams-windows-people-open.jsonl",
        ] {
```

Trong `crates/speaker-worker/src/reader/extract.rs`, thay

```rust
            (
                "zoom-macos-synthetic.jsonl",
                z.app(Os::Macos, MeetingApp::Zoom).unwrap(),
            ),
        ];
        for (file, app) in cases {
            let mut selves = 0;
```

bằng

```rust
            (
                "zoom-macos-synthetic.jsonl",
                z.app(Os::Macos, MeetingApp::Zoom).unwrap(),
            ),
            (
                "teams-windows-people-closed.jsonl",
                r.app(Os::Windows, MeetingApp::Teams).unwrap(),
            ),
            (
                "teams-windows-people-open.jsonl",
                r.app(Os::Windows, MeetingApp::Teams).unwrap(),
            ),
        ];
        for (file, app) in cases {
            let mut selves = 0;
```

và trong test đếm lệnh đọc tệ nhất của một lượt (`a_whole_pass_with_calibration_stays_within_the_read_limit`, giới hạn 3 000), cùng danh sách:

Trong `crates/speaker-worker/src/reader/extract.rs`, thay

```rust
            (
                "zoom-macos-synthetic.jsonl",
                z.app(Os::Macos, MeetingApp::Zoom).unwrap(),
            ),
        ];
        for (file, app) in cases {
            let mut worst = 0;
```

bằng

```rust
            (
                "zoom-macos-synthetic.jsonl",
                z.app(Os::Macos, MeetingApp::Zoom).unwrap(),
            ),
            (
                "teams-windows-people-closed.jsonl",
                r.app(Os::Windows, MeetingApp::Teams).unwrap(),
            ),
            (
                "teams-windows-people-open.jsonl",
                r.app(Os::Windows, MeetingApp::Teams).unwrap(),
            ),
        ];
        for (file, app) in cases {
            let mut worst = 0;
```

Trong `crates/speaker-worker/src/reader/extract.rs`, thay

```rust
    #[test]
    fn meet_fixture_finds_four_tiles_with_both_anchors() {
```

bằng

```rust
    /// Kế hoạch 05 (Task 11): trên Windows, công thức Teams phải tìm đủ ba người ở ít nhất 95% ảnh chụp của mỗi bản ghi.
    #[test]
    fn teams_windows_fixtures_find_the_three_people_almost_always() {
        let r = recipes();
        let app = r.app(Os::Windows, MeetingApp::Teams).unwrap();
        for file in ["teams-windows-people-closed.jsonl", "teams-windows-people-open.jsonl"] {
            let snaps = fixture(file);
            let full = snaps.iter().filter(|s| tiles_of(s, app).1.len() >= 3).count();
            assert!(
                full * 100 >= snaps.len() * 95,
                "{file}: {full}/{} ảnh chụp có đủ ba ô",
                snaps.len()
            );
        }
    }

    #[test]
    fn meet_fixture_finds_four_tiles_with_both_anchors() {
```

Trong `crates/speaker-worker/src/names/track.rs`, thay

```rust
    fn agreement(r: &Recipes, file: &str, app: MeetingApp, name: &str, who: &str) -> f64 {
        let app = r.app(Os::Macos, app).unwrap();
```

bằng

```rust
    fn agreement(r: &Recipes, os: Os, file: &str, app: MeetingApp, name: &str, who: &str) -> f64 {
        let app = r.app(os, app).unwrap();
```

Trong `crates/speaker-worker/src/names/track.rs`, thay

```rust
                let a = agreement(&recipes(), file, MeetingApp::Teams, who, who);
```

bằng

```rust
                let a = agreement(&recipes(), Os::Macos, file, MeetingApp::Teams, who, who);
```

Trong `crates/speaker-worker/src/names/track.rs`, thay

```rust
        let a = agreement(
            &meet_recipes(),
            "meet-chrome-macos.jsonl",
```

bằng

```rust
        let a = agreement(
            &meet_recipes(),
            Os::Macos,
            "meet-chrome-macos.jsonl",
```

Trong `crates/speaker-worker/src/names/track.rs`, thay

```rust
    /// Kế hoạch 01: ô của người nói trong cửa sổ của chính nó khớp 69–80% với từng tín hiệu
```

bằng

```rust
    /// Kế hoạch 05 (Task 11): trên Windows, khung "đang nói" ở ô video Teams phải khớp sự thật từng khách ≥ [`MIN_WINDOWS_AGREEMENT`]
    /// ở cả hai bản ghi (bảng People đóng và mở). Đây cũng là tiêu chí để mục Teams Windows được vào `recipes.json` (Task 11 Step 9).
    const MIN_WINDOWS_AGREEMENT: f64 = 0.85;

    #[test]
    fn teams_windows_frames_follow_who_speaks() {
        for file in ["teams-windows-people-closed.jsonl", "teams-windows-people-open.jsonl"] {
            for who in ["Lan", "Minh"] {
                let a = agreement(&recipes(), Os::Windows, file, MeetingApp::Teams, who, who);
                eprintln!("{file} {who}: {a:.3}");
                assert!(a >= MIN_WINDOWS_AGREEMENT, "{file} {who}: {a:.3}");
            }
        }
    }

    /// Kế hoạch 01: ô của người nói trong cửa sổ của chính nó khớp 69–80% với từng tín hiệu
```

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-worker --lib -- teams_windows fixture_tile_names fixtures_load a_whole_pass 2>&1 | grep -E "^test |panicked" | head -10`
Expected: đỏ: `r.app(Os::Windows, MeetingApp::Teams).unwrap()` panic vì bản build sẵn chưa có mục Windows (`recipes()` đọc `recipes.json`): bốn test dùng `recipes()` cho Windows đỏ (`teams_windows_frames_follow_who_speaks`, `teams_windows_fixtures_find_the_three_people_almost_always`, `fixture_tile_names_are_the_made_up_ones`, `a_whole_pass_with_calibration_stays_within_the_read_limit`); `the_fixtures_load_in_time_order` xanh (đã có file fixture). Step 8 thêm mục Windows để cả bốn xanh.

- [ ] **Step 8: Thử công thức đã chỉnh trên fixture, bằng cách thêm tạm mục Windows vào bản build sẵn** — thêm đúng mục Teams của `teams-windows.recipes.json` (đã chỉnh ở Step 3–4) vào cuối mảng `apps` của `recipes.json` và tăng `version` một đơn vị; chỉ chèn chữ, không định dạng lại phần đã có:

Run: `cd $W && cp scripts/speaker-recipes/recipes.json $DATA/recipes.json.truoc-05 && python3 -I - <<'PY'
import json, re
root = "scripts/speaker-recipes"
path = f"{root}/recipes.json"
text = open(path, encoding="utf-8").read()
cand = json.load(open(f"{root}/fixtures/teams-windows.recipes.json", encoding="utf-8"))
assert [a["os"] for a in cand["apps"]] == ["windows"], "file ứng viên phải có đúng một mục Windows"
entry = json.dumps(cand["apps"][0], ensure_ascii=False, indent=2)
entry = "\n".join("    " + line for line in entry.split("\n"))
head, sep, tail = text.rpartition("\n  ]")
assert sep, "recipes.json không có dạng mong đợi"
text = head + ",\n" + entry + sep + tail
text = re.sub(r'("version": )(\d+)', lambda m: m.group(1) + str(int(m.group(2)) + 1), text, count=1)
open(path, "w", encoding="utf-8").write(text)
json.loads(text)
print("đã thêm mục Windows của Teams")
PY
export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-worker --lib -- teams_windows fixture_tile_names fixtures_load a_whole_pass teams_frames 2>&1 | grep -E "^test |jsonl [A-Za-z]+: 0|panicked" | head -14`
Expected: `đã thêm mục Windows của Teams`; `teams-windows-people-closed.jsonl Lan: 0.9xx` (và Minh, và bản `open`; số thật, in dấu chấm) và mọi test `ok`. **Đạt tiêu chí** (a), (b) ở đầu Task và `fixture_tile_names_are_the_made_up_ones`, `a_whole_pass_with_calibration_stays_within_the_read_limit` (số lệnh đọc tệ nhất của một lượt ≤ 3 000) xanh thì giữ `recipes.json` đã sửa và đi Step 9. **Không đạt** thì khôi phục bản gốc: `cp $DATA/recipes.json.truoc-05 scripts/speaker-recipes/recipes.json`, quay lại Step 3–4 chỉnh công thức (tối đa hai vòng); vẫn không đạt thì dừng, ghi số vào `05-windows.md`, **giữ tắt** (mục Teams Windows không vào `recipes.json`; xóa luôn các test và fixture đã thêm ở Step 7 khỏi cây, hay đánh `#[ignore]` kèm lý do, để `cargo test` xanh) và báo chủ dự án.

- [ ] **Step 9: Đưa Teams Windows vào bản build sẵn (chỉ khi Step 8 đạt)** — `recipes.json` đã được Step 8 sửa (mục Windows của Teams thêm vào cuối, `version` tăng 1). Cập nhật test của bản build sẵn (trước đây ghim "chưa có Windows"):

Trong `crates/speaker-recipe/src/lib.rs`, thay

```rust
    /// QĐ 16, 32 của kế hoạch 04: bản build sẵn chỉ có Teams. Zoom chưa có bản ghi thật (rà soát A-Q11); Meet không có chỉ báo ở cửa
    /// sổ người nghe (rà soát lần 2 A-Q1). Task 21 thêm lại khi đạt tiêu chí và chủ dự án đồng ý.
    #[test]
    fn the_builtin_recipes_cover_only_teams_on_macos() {
        let r = parse(BUILTIN_JSON).unwrap();
        assert!(r.dropped.is_empty(), "{:?}", r.dropped);
        assert!(r.version >= 1);
        assert!(r.app(Os::Macos, MeetingApp::Teams).is_some());
        for app in [MeetingApp::Zoom, MeetingApp::MeetChrome, MeetingApp::MeetEdge] {
            assert!(r.app(Os::Macos, app).is_none(), "{app:?} tắt mặc định");
        }
        assert!(!r.has_os(Os::Windows), "kế hoạch 05 thêm Windows");
    }
```

bằng

```rust
    /// QĐ 16, 32 của kế hoạch 04, QĐ 8 của kế hoạch 05: bản build sẵn chỉ có Teams (macOS, và Windows từ Task 11 của kế hoạch 05).
    /// Zoom chưa có bản ghi thật (rà soát A-Q11); Meet không có chỉ báo ở cửa sổ người nghe (rà soát lần 2 A-Q1). Thêm lại khi đạt
    /// tiêu chí và chủ dự án đồng ý.
    #[test]
    fn the_builtin_recipes_cover_only_teams() {
        let r = parse(BUILTIN_JSON).unwrap();
        assert!(r.dropped.is_empty(), "{:?}", r.dropped);
        assert!(r.version >= 1);
        for os in [Os::Macos, Os::Windows] {
            assert!(r.app(os, MeetingApp::Teams).is_some(), "{os:?}");
            for app in [MeetingApp::Zoom, MeetingApp::MeetChrome, MeetingApp::MeetEdge] {
                assert!(r.app(os, app).is_none(), "{app:?} trên {os:?} tắt mặc định");
            }
        }
    }
```

Thêm một chỗ sửa nữa: một test của worker ghim `recipe_version == 1` của bản build sẵn; `version` đã tăng ở Step 8, nên so với chính bản build sẵn:

Trong `crates/speaker-worker/src/session.rs`, thay

```rust
                    assert_eq!(*recipe_version, 1);
```

bằng

```rust
                    assert_eq!(
                        *recipe_version,
                        speaker_recipe::parse(speaker_recipe::BUILTIN_JSON).unwrap().version
                    );
```

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-recipe -p speaker-worker && cargo test -p speaker-recipe -p speaker-worker 2>&1 | grep -E "^test result|FAILED|panicked"; git diff --stat scripts/speaker-recipes/recipes.json | tail -1`
Expected: mọi dòng `test result: ok`: `speaker-recipe` 8; `speaker-worker` lib **162 + 2** = **164** đạt (hai test mới: `teams_windows_frames_follow_who_speaks`, `teams_windows_fixtures_find_the_three_people_almost_always`; test của bản build sẵn chỉ đổi tên và nội dung), 5 bỏ qua; `worker_process` 10; `recipes.json` đổi một mục thêm. **Kiểm chéo nền tảng:** worker Windows giờ có công thức Windows trong bản build sẵn nên `reader_setup` tạo luồng đọc trên Windows (test `windows_reads_only_when_a_recipe_has_a_windows_entry` dùng công thức riêng nên vẫn đạt). Tính năng vẫn tắt với người dùng cuối tới kế hoạch 07 (`speaker::enabled()`).

- [ ] **Step 10: Ghi kết quả** — `05-windows.md` mục Task 11: các số thật (số ô, khớp từng khách từng bản ghi, độ trễ, `delay_ms` chọn, có hay không `confirm_id`, kết luận bật hay giữ tắt). Quét như Task 10 Step 6.

- [ ] **Step 11: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt --all -- --check && cargo clippy -p speaker-recipe -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && scripts/check-windows.sh --locked 2>&1 | tail -1 && scripts/release/check-no-network.sh && git status --short | wc -l; ls scripts/speaker-recipes | grep -c pycache`
Expected: sạch; hai `Finished`; không mã mạng; `0`. Không commit.

---

### Task 12: Chi phí đọc trên Windows, so ngân sách **(sau Task 10)**

**Files:** `$B/results/05-windows.md` (mục Task 12)

- [ ] **Step 1: Tóm tắt số liệu của lượt đo chi phí** (từ `chay-05.ps1 -Che do`)

Run: `cd $W && python3 -I -B $B/windows/tom_tat_do.py $DATA/out/05/teams-win-do/do-teams-1-lan-giay-*.jsonl $DATA/out/05/teams-win-do/do-teams-4-lan-giay-*.jsonl; grep -h "giây CPU" $DATA/out/05/teams-win-do/chay-05-teams-do.txt`
Expected: hai khối tóm tắt (1 lần/giây, 4 lần/giây) và ba dòng `khong-doc`, `1-lan-giay`, `4-lan-giay` kiểu `app họp dùng thêm X giây CPU trong 60 giây (Y% một lõi); uia-record dùng Z giây CPU`.

- [ ] **Step 2: So với ngân sách** — điền bảng vào `05-windows.md`. Ngân sách (spec 6.2, 11; tiêu chí chi phí đề xuất của kế hoạch này, chủ dự án duyệt ở "Điều cần chủ dự án quyết" mục 8):

| Chỉ số | Mức đạt | Nguồn số |
|---|---|---|
| Thời gian lượt p90 (nhanh) | ≤ 30 ms | `tom_tat_do.py`, mức 1 lần/giây |
| Thời gian lượt p90 (đầy đủ) | ≤ 30 ms **hay** trải qua nhiều lượt mà ô đầu tiên vẫn có trong ≤ 5 s kể từ lúc cửa sổ họp xuất hiện | `tom_tat_do.py`, số lượt tới lúc `số ô` đạt 3 |
| Lệnh đọc p90 | ≤ 3 000 | `tom_tat_do.py` |
| Lệnh quá hạn, bị chặn | 0 trong lúc đo | `tom_tat_do.py` |
| App họp thêm CPU, 1 lần/giây | ≤ 3% một lõi hơn mức `khong-doc` | `chay-05-teams-do.txt` |
| App họp thêm CPU, 4 lần/giây | ≤ 10% một lõi hơn mức `khong-doc` | như trên |
| CPU của `uia-record`, 1 lần/giây | ≤ 3% một lõi | như trên |

- [ ] **Step 3: Kết luận và việc kế**

Đạt hết: ghi "đạt", không việc gì thêm. **Không đạt** (nhất là lượt đầy đủ trải qua nhiều lượt, hay CPU app họp vượt): **không** tự đổi mã. Ghi số, và đề xuất một trong các hướng (chủ dự án quyết, mục 8): (a) lấy cả cây con bằng một lệnh (`FindAllBuildCache` với `TreeScope_Subtree` trong `ComBackend::children`, giữ đệm trong backend, không đổi trait), vì mỗi lệnh UI Automation sang tiến trình khác tốn nhiều hơn tổng số phần tử gợi ý; (b) hạ nhịp mặc định trên Windows xuống 1 lần/2 giây và bỏ nhịp nhanh; (c) tắt Windows khi máy yếu như chế độ dịch trong lúc nói. Mỗi hướng là một kế hoạch nhỏ riêng (05c), không làm trong kế hoạch này.

- [ ] **Step 4: Mốc kiểm**

Run: `cd $W && grep -nE "/User[s]/|C:\\\\User[s]" $B/results/05-windows.md | head -2; git status --short | wc -l`
Expected: không dòng nào; chỉ `05-windows.md` đổi. Không commit.

---

### Task 13: Meet (Chrome, Edge) và Zoom trên Windows **(cần chủ dự án)**

Khoảng 2–3 giờ, cần Chrome và Edge trên Windows, hai Gmail (khách Meet phải đăng nhập, `guest_chrome.sh` của kế hoạch 01), Zoom Workplace trên Windows và tài khoản Zoom. Mục tiêu **không** phải bật ngay mà là ghi cây thật và áp tiêu chí đã có ở 04: **Meet** chỉ bật khi tìm được chỉ báo dùng được **ở cửa sổ người nghe** (04 QĐ 32); **Zoom** chỉ vào bản build sẵn khi có bản ghi thật (04 QĐ 16). Không đạt thì giữ tắt, không phải làm gì thêm ngoài ghi kết quả.

**Files:** `$DATA/out/05/`, `$B/results/05-windows.md` (mục Task 13), có thể sửa `meet-windows.recipes.json`, `zoom-windows-explore.recipes.json`; chỉ khi đạt và chủ dự án đồng ý: `recipes.json`, fixture.

- [ ] **Step 1: Meet trên Chrome (cửa sổ chủ phòng = người nghe)** — chủ dự án mở phòng Meet bằng Chrome Windows (tài khoản Google, camera tắt, mic tắt); khách Lan, Minh vào bằng `guest_chrome.sh` (Mac) với hai Gmail, mic bật/tắt theo kịch bản như 01 Task 12 (Meet); chủ dự án chạy `chay-05.ps1 -App meet_chrome -Che ghi -Giay 120`, Mac chạy `run_schedule.py - meet-win-chrome <cách bật mic của Meet>`. Gửi `ket-qua-05-ghi-meet_chrome-*.zip` → `$DATA/out/05/meet-win-chrome/`. Cùng cách cho Edge (`-App meet_edge`) nếu chủ dự án dùng Edge cho Meet.

- [ ] **Step 2: Phân tích Meet** (làm trên Mac)

Run: `cd $W && f=$(ls $DATA/out/05/meet-win-chrome/cay-meet_chrome-*.jsonl | head -1); python3 -I -B $B/windows/tom_tat_do.py $DATA/out/05/meet-win-chrome/do-meet_chrome-*.jsonl; python3 -I -B $B/windows/liet_ke_hinh_dang.py $f --min-anh 5 | grep -E "oZRSLe|DYfzY|qg7mD" | head`
Expected: số ô (mong đợi hai ô trong cửa sổ chủ phòng: chủ phòng và mỗi khách là một ô), các lớp `oZRSLe`, `DYfzY`, `qg7mD` (nếu có: lớp CSS Meet giữ nguyên trên Windows). Dò chỉ báo ở cửa sổ người nghe: `find_indicators.py` như Task 11 Step 4. Tiêu chí bật (như 04 QĐ 32): có chỉ báo đổi theo người ở xa nói **trong cửa sổ người nghe**, và độ khớp ≥ 0,80 (cách đo `agreement` của 04, với fixture ẩn danh qua Task 11 Step 5–6, `--web-area`). Không có thì **giữ tắt**, ghi "không có chỉ báo ở cửa sổ người nghe trên Windows" vào `05-windows.md`.

- [ ] **Step 3: Zoom** — chủ dự án vào họp Zoom Windows (camera, mic tắt); khách vào bằng Zoom web (`guests.py` `/open`, như 01 Task 12 phần Zoom nếu có; không thì hai người thử khác); chạy `chay-05.ps1 -App zoom -Che ghi -Giay 120` (`zoom-windows-explore.recipes.json`: chỉ để tìm cửa sổ và ghi cây) và kịch bản. → `$DATA/out/05/zoom-win/`. Phân tích: `liet_ke_hinh_dang.py` lọc theo nhãn có "audio", "speaker"; tìm hình dạng ô và nhãn chứa tên và chữ "active speaker"/"đang nói"; viết công thức thật (ô, nhãn, chỉ báo, `delay_ms` đo bằng `--onset` nếu chỉ báo là phần tử), ẩn danh fixture (Task 11 Step 5–7), thêm test độ khớp tương tự Task 11. Tiêu chí vào bản build sẵn: có bản ghi thật, ô đủ người ≥ 95% ảnh chụp, khớp ≥ 0,85, chủ dự án đồng ý (04 QĐ 16). Không đạt thì giữ tắt.

- [ ] **Step 4: Tác dụng phụ lên trình duyệt (chế độ trợ năng)** — chủ dự án mở tab `chrome://accessibility` (trang của chính trình duyệt, không phải cuộc họp) **trước** khi chạy `uia-record`, **trong** lúc nó chạy với Meet, và **sau** khi nó dừng 30 giây, rồi đọc dòng "Accessibility modes"/"Chế độ hỗ trợ tiếp cận" (chữ trên trang) và gửi ba dòng đó. Ghi vào `05-windows.md`: chế độ bật khi bộ đọc đọc cửa sổ Meet không, có tự tắt sau khi dừng không. **Chưa ai biết** (file 05, QĐ 9): nếu Chrome giữ chế độ bật tới khi khởi động lại thì chính sách quyền riêng tư (kế hoạch 07) phải nói đúng điều đó cho Windows, như đã làm cho Teams trên macOS.

- [ ] **Step 5: Ghi kết quả** — `05-windows.md` mục Task 13: số ô, lớp thấy được, kết luận Meet/Zoom bật hay giữ tắt cho từng app (Chrome, Edge, Zoom), kết quả Step 4. Quét như Task 10 Step 6. Việc "bật" là một kế hoạch nhỏ riêng khi chủ dự án đồng ý (đưa mục vào `recipes.json`, fixture, test), **không** làm tự động ở đây.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short | wc -l && ls scripts/speaker-recipes/fixtures | grep -c "windows"`
Expected: `git status` chỉ thêm những gì Step 1–5 thực sự tạo (nếu Meet, Zoom giữ tắt thì chỉ `05-windows.md` đổi); số file `*windows*` ≥ 7 (Task 11) hay ≥ 3 (Task 11 giữ tắt). Không commit.

---

### Task 14: Cập nhật spec và ghi chú **(sau Task 10–13)**

**Files:**
- Modify: `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` (§6.2, §6.4, §6.6, §11, §14)
- Modify: `bench/2026-10-26-nguoi-noi/results/tong-hop.md`, `bench/2026-10-26-nguoi-noi/README.md`

- [ ] **Step 1: Spec §6.2, §6.4, §6.6** — các chỗ ghi "Windows … chờ Task 13 của kế hoạch 01" trở thành số thật (hay "chưa có bản ghi" nếu Task 10 chưa làm). Tìm chỗ:

Run: `cd $W && grep -n "Task 13" docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md | cut -c1-140`
Expected: các dòng ở §6.2 ("Windows: … chờ Task 13 của kế hoạch 01"), §6.4 ("Windows (Teams, Meet): chờ Task 13…"), §6.6 ("Windows: chờ Task 13…"), §11 ("Windows i5: … Task 13…"), §14 ("Windows chưa đo…").

Với mỗi chỗ, thay bằng một đoạn ngắn đúng sự thật **theo `05-windows.md`**: (§6.2) bộ đọc UI Automation đã làm (kế hoạch 05; `ElementFromHandle` cho cửa sổ họp, `FindAllBuildCache` lấy con kèm hình dạng, hạn chờ 0,2 s qua `IUIAutomation2`), tên và chỉ báo đọc được tới đâu trên Teams (số liệu Task 10–11), chi phí đọc (Task 12); (§6.4) chỉ báo của Teams, Meet, Zoom trên Windows theo bản ghi; (§6.6) độ trễ `delay_ms` đã đo; (§11) số đo i5 của chi phí đọc, và "A-spk4 trên i5 nghiệm thu ở kế hoạch 07"; (§14) dòng Windows: cái gì đã đo (Teams) và cái gì còn chưa (Meet, Zoom nếu chưa làm; RAM của B' trên Windows nếu gói 02b chưa chạy). Chỉ ghi số có trong `05-windows.md`; chưa làm Task nào thì chữ "chờ" giữ nguyên, kèm "kế hoạch 05 đã có bộ đọc và gói đo, chờ chủ dự án chạy" (không bịa số).

- [ ] **Step 2: Tổng hợp và README của `bench`**

Sửa hàng 8 và 9 của bảng trong `results/tong-hop.md` ("Bộ đọc UI Automation trên Windows… Chờ Task 13") thành trạng thái thật + liên kết `05-windows.md`; thêm vào `$B/README.md` một đoạn cho `windows/` (công cụ phân tích, cách dùng ba dòng) và `results/05-windows.md`.

- [ ] **Step 3: Mốc kiểm**

Run: `cd $W && grep -c "chờ Task 13 của kế hoạch 01" docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md; grep -rnE "/User[s]/|C:\\\\User[s]" docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md $B/results/05-windows.md $B/README.md | head -2; git status --short | wc -l`
Expected: `0` (không còn "chờ Task 13 của kế hoạch 01" ở bất kỳ phần nào đã có số; còn thì phải kèm "kế hoạch 05 … chờ chủ dự án"); không đường dẫn cá nhân. Không commit.

---

### Task 15: Mốc kiểm tổng của kế hoạch 05

**Files:** không

- [ ] **Step 1: fmt, clippy, Windows**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt --all -- --check && echo fmt-ok && cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -1 && scripts/check-windows.sh --locked 2>&1 | tail -1`
Expected: `fmt-ok`; hai `Finished`, không cảnh báo.

- [ ] **Step 2: Test**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-recipe 2>&1 | grep -E "^test result"; cargo test -p speaker-worker 2>&1 | grep -E "^test result"; cargo test -p pipeline --lib 2>&1 | grep -E "^test result"; cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result"; node_modules/.bin/vitest run 2>&1 | tail -3; python3 -I -B scripts/speaker-recipes/test_make_fixture.py 2>&1 | tail -1; python3 -I -B $B/windows/test_windows_tools.py 2>&1 | tail -1`
Expected: không test nào đỏ. Số theo trạng thái cuối: `speaker-recipe` 8; `speaker-worker` lib 162 (164 nếu Task 11 vào bản build sẵn), 5 bỏ qua; `pipeline` lib 360; `meeting-translator --lib` 935; vitest như Task 0 của file 05 (không đổi); hai bộ Python `OK`.

- [ ] **Step 3: Bảo mật và phụ thuộc**

Run: `cd $W && scripts/release/check-no-network.sh && cargo deny check 2>&1 | tail -3; cargo audit 2>&1 | tail -3; git diff --shortstat Cargo.lock`
Expected: không mã mạng; `cargo deny` `advisories ok, bans ok, licenses ok, sources ok`; `cargo audit` không lỗ hổng mới (các cảnh báo "unmaintained" có từ trước giữ nguyên: ghi số); `Cargo.lock` không đổi so với trước file 05.

- [ ] **Step 4: Quét repo**

Run: `cd $W && git status --short | awk '{print $2}' | xargs grep -lE "/User[s]/[a-zA-Z]|C:\\\\User[s]\\\\[a-zA-Z]" 2>/dev/null | head; git status --short | awk '{print $2}' | xargs grep -ln "cay-teams\|8:live:\|8:orgid:" 2>/dev/null | head; ls $B/windows | grep -c pycache; ls scripts/speaker-recipes | grep -c pycache`
Expected: ba dòng đầu rỗng chỉ khi file đó không phải file kế hoạch/test tự chứa mẫu cấm (các file `tree.rs`, `make_fixture.py`, `test_make_fixture.py` có chuỗi mẫu cấm **dùng để chặn**: kiểm từng file in ra là một trong số đó); hai số cuối `0`.

- [ ] **Step 5: Dọn** — không tiến trình nền nào do kế hoạch này mở (cargo, python). Không đụng tiến trình không do mình mở (app dev, Vite). Xóa các thư mục tạm do chính mình tạo ở `$DATA` (ví dụ `$DATA/plan05-kiem` nếu còn); không xóa dữ liệu đã có.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short | wc -l && git log --oneline -1`
Expected: số dòng bằng Task 0 của file 05 cộng các file kế hoạch này tạo; commit mới nhất vẫn là commit trước kế hoạch (không có commit nào). Không commit.

---

## Phủ spec (cả file 05 và 05b)

Số Task dùng chung cho hai file; "T5" là Task 5.

| Mục spec | Yêu cầu | Task |
|---|---|---|
| §4.1 | bộ đọc tên trong `speaker-worker`, luồng riêng, không chặn phụ đề, worker lỗi thì chỉ worker chết, không mã mạng | T6 (`uia::spawn` luồng `speaker-reader`; lỗi khởi tạo thì log và thôi), T8 Step 3–4 (kiểm không mã mạng, không nhập `ws2_32`) |
| §4.1 | ưu tiên thấp (Windows `BELOW_NORMAL_PRIORITY_CLASS`), nạp DLL chỉ từ thư mục app và System32 | đã có từ 02 (`platform.rs`); T8 Step 4 (mọi DLL nhập là DLL hệ thống) |
| §4.2 | `Ready.reader_platform = Windows`; `ReaderState` | T6 (`PLATFORM`), T6 (`LiveReader` cho `Sample`, `Blocked`) |
| §5.5 | giọng trong phòng không nhận tên | không đổi (logic của 04, chạy trên mẫu của cả hai nền tảng) |
| §6.1 | danh sách app viết cứng (`ms-teams.exe`, `Zoom.exe`, `chrome.exe`, `msedge.exe`), chỉ cửa sổ họp, ≤ 2 cửa sổ, quét mỗi 2 s, chỉ tiêu đề cửa sổ | T4 (`app_of_exe`, `Scanner`; test `titles_of_other_apps_are_never_read`, `at_most_two_windows_per_app`), T6 (`Win32Desktop`), QĐ 4 |
| §6.2 | Windows: `ElementFromHandle`, bộ nhớ đệm thuộc tính, duyệt cây; không cần đặt thuộc tính | T2 (`UiaTree`), T6 (`ComBackend`: `BuildUpdatedCache`, `FindAllBuildCache`); QĐ 7 |
| §6.2 | hạn chờ 0,2 s mỗi lệnh | T6 (`IUIAutomation2` 200 ms; QĐ 10) |
| §6.2 | ≤ 3 000 phần tử, ≤ 30 ms mỗi lượt; nhịp 1 lần/giây, 4 lần/giây khi cần | T5 (`read_windows` trong một `Budget`), T6 (`tick`: `MAX_ELEMENTS`, `PASS_BUDGET`; nhịp qua `next_turn`); T12 (đo thật) |
| §6.2 | "Tên và chỉ báo đọc được tới đâu: chờ Task 13 của kế hoạch 01" | T10, T11 (bản ghi và công thức thật), T14 (sửa spec) |
| §6.3 | chỉ tên, mic, mức nói, người dùng; làm gọn tên | không đổi (`tidy_name`); T2 (không đọc `HelpText`, `Name` chọn lọc), T3 (test `meet_like_tree_reads_text_only_inside_the_matching_document`) |
| §6.4 | tín hiệu "đang nói" Teams, Meet, Zoom trên Windows | T3 (đường ống trên cây tổng hợp), T11 (Teams thật), T13 (Meet, Zoom thật hay giữ tắt) |
| §6.5 | tự hiệu chỉnh | không đổi; `--calibrate` của `uia-record` (T7) và ghi ở T10 để thử |
| §6.6 | độ trễ theo app đo trên Windows | T11 Step 4 (`delay_ms` từ `--onset`), T13 |
| §6.7 | Windows không có dòng mời cấp quyền | T5 (`health` không bao giờ `NoPermission`), T8 Step 5 |
| §6.8 | tác động lên app khác: chi phí đọc, bật trợ năng | T12 (giây CPU, ba mức), T13 Step 4 (chế độ trợ năng của Chrome); QĐ 9, 12 |
| §7.1 | công thức theo hệ điều hành; app ngoài danh sách bỏ; mẫu chữ giới hạn | T1 (`Os::*_role`), T3 (ba công thức ứng viên hợp lệ), T11 (mục Windows vào `recipes.json` khi đạt); phần tải từ xa: kế hoạch 06 |
| §10 | không bí mật mới, không quyền mới, đọc trong phạm vi, tên không vào log, log chỉ số đếm | QĐ 7, 9; T4 (`Debug` che tiêu đề), T6 (log chỉ mã lỗi), T8 Step 3–4 |
| §11 | đọc ≤ 30 ms; tải trên i5; A-spk4 trên i5 | T12 (chi phí đọc trên i5); A-spk4 trên i5: kế hoạch 07 (QĐ 15) |
| §12 | bộ đọc trên cây ghi sẵn cho từng app và hệ điều hành; test công thức | T3 (cây tổng hợp), T11 (fixture Teams Windows thật, độ khớp, tên giả), T13 (Meet, Zoom khi có) |
| §12 | A-spk3 phần Windows (Teams) | T11 (khớp ≥ 0,85 trên fixture), nghiệm thu tên thật cuối cùng: kế hoạch 07 |
| §13 mục 5 | bộ đọc UI Automation cho ba app; chủ dự án thử trên máy Windows | T6, T10, T13 |
| §14 | "Windows chưa đo", "Edge chưa kiểm" | T10–T13; Edge: T13 Step 1 |

## Để kế hoạch sau

- **Kế hoạch 06 (vận hành):** `uia-record` thay `ax-record` trong `tools/speaker-canary/` trên máy Windows (Task Scheduler); `speaker_health` trên Windows (cần `app_version`: Teams mới là gói MSIX trong `WindowsApps`, đọc file phiên bản của file chạy ở đó thường bị từ chối; chọn cách khác, ví dụ phiên bản gói qua tên thư mục hay Package Manager) và mẫu chỉ báo tự học có mô tả đọc được; công thức Windows tải từ xa có ký số (`recipes.json` đã chứa mục Windows từ Task 11, hay bản tải về thêm mục) — worker Windows nhận công thức qua `Load` và tự bắt đầu đọc khi công thức có mục Windows, không cần phát hành app; `pnpm recipes:update` chạy cả fixture Windows.
- **Kế hoạch 07 (phát hành):** chính sách quyền riêng tư nói đúng chuyện trợ năng trên Windows (kết quả T13 Step 4: Chrome, Edge giữ hay tự tắt chế độ trợ năng; Teams WebView2 chưa kiểm được); nghiệm thu A-spk3 (tên thật, kịch bản tự động, Teams × Windows), A-spk4 (độ trễ khi đọc tên bật) và A-spk5 trên i5, A-spk6 (họp thật ≥ 3 người, Windows), A-spk7.
- **Hợp nhất hai bản vòng lặp đọc** (`reader::macos::LiveReader::tick`, `reader::uia::LiveReader::tick` + `Stats` của macOS với `reader::stats`) dùng `windowset::read_windows`, `reconcile`, `health`, `stats::Stats` (QĐ 5): sau khi 04b Task 19–21 đạt (macOS thử với app thật).
- **Nếu chi phí đọc không đạt (T12 Step 3):** kế hoạch 05c: lấy cả cây con một lệnh trong `ComBackend`; hay hạ nhịp, hay tự tắt trên máy yếu.
- **Zoom và Meet trên Windows:** vào `recipes.json` khi T13 đạt tiêu chí và chủ dự án đồng ý (như 04 QĐ 16, 32).
- **Nhiều app họp cùng có cửa sổ họp:** như macOS, chỉ đọc app đầu theo thứ tự `MeetingApp::ALL` (chưa xếp kế hoạch).
- **Kiểm đường dẫn file chạy** (Program Files, WindowsApps, `%LocalAppData%`) ngoài tên file: chỉ nếu chủ dự án muốn chặt hơn spec 6.1 (mục 7 của "Điều cần chủ dự án quyết").
- **Tên lớp cửa sổ Win32 làm `window_id`** (Zoom, Teams): chỉ khi bản ghi thật cho thấy tiêu đề không đủ phân biệt.

## Rủi ro và điều chưa biết

| Rủi ro | Cách xử lý trong kế hoạch |
|---|---|
| **Chưa có bản ghi cây giao diện Windows nào.** Mọi tên vai trò, `AutomationId`, `ClassName`, tiêu đề cửa sổ, nhãn ô trên Windows là **đoán** từ macOS. Chromium có thể không đưa lớp CSS (`ClassName`) hay id DOM (`AutomationId`) ra UI Automation ở chế độ trợ năng nhẹ; Teams mới (WebView2) và Meet có thể khác macOS | Công thức Windows ở dạng ứng viên, **mặc định TẮT**, bộ đọc Windows không chạy khi công thức không có mục Windows (QĐ 6, 8); T10 ghi cây thật, T11 chỉnh công thức theo bản ghi và chỉ bật khi đạt tiêu chí; không đạt thì "Người N" (ưu tiên 2: thà không tên còn hơn sai tên) |
| **Mã Windows (`uia.rs`) chỉ biên dịch chéo và clippy được trên Mac**: COM, hạn chờ, lệnh UI Automation, `EnumWindows` chưa chạy lần nào | Phần thuần chiếm phần lớn logic và có test (T2–T5); phần FFI mỏng, `unsafe` có chú thích `SAFETY`; CI Windows (`windows-2025`) biên dịch, clippy và chạy test thuần; hành vi thật kiểm ở T10 bằng `uia-record`; lỗi thì chỉ luồng đọc dừng (log), phụ đề chạy bình thường |
| **Chi phí một lệnh UI Automation chưa biết** (qua COM sang tiến trình khác); 30 ms có thể chỉ đủ vài chục lệnh, ô đầu tiên có thể mất vài giây mới thấy | `Walk` đã thiết kế để trải một lượt đầy đủ qua nhiều lượt; mỗi con đi cùng lệnh lấy con (một lệnh cho cả danh sách), hình dạng đọc cùng lệnh (QĐ 3); T12 đo; hướng nếu không đạt: lấy cả cây con (T12 Step 3) |
| **UI Automation có thể bật chế độ trợ năng của Chromium** (Teams mới, Chrome, Edge) và làm app đó tốn thêm, không có cách "trả" như `AXEnhancedUserInterface` | Chỉ chạm cửa sổ họp (QĐ 9), không bộ nghe sự kiện, bộ đọc không nạp khi không có công thức Windows; T12, T13 Step 4 đo; chính sách quyền riêng tư (kế hoạch 07) nói đúng |
| App họp chạy quyền cao hơn (quản trị) chặn UI Automation | `E_ACCESSDENIED` đếm là lệnh hỏng, `Blocked` sau 5 lượt, "Người N", không xin nâng quyền (QĐ 7); `uia-record` báo `denied` |
| Tiêu đề cửa sổ họp Teams trên Windows khác macOS ("Meeting with …" có thể thành "<chủ đề> \| Microsoft Teams"), cuộc họp lên lịch, ngôn ngữ khác | Không khớp thì không đọc (an toàn, "Người N"); T11 Step 3 nhánh A sửa mẫu theo bản ghi; mẫu 5 ngôn ngữ: kế hoạch 06 |
| Teams có thể mở cuộc họp trong cửa sổ tách riêng hay trong cửa sổ chính; ô có thể không phải `MenuItem` | Công thức đọc theo hình dạng bản ghi thật (T11); `confirm_id` bỏ được nếu không có id ổn định (T11 Step 3) |
| Nhận app chỉ theo tên file chạy (spec 6.1): một file tên `chrome.exe` ở chỗ khác bị coi là Chrome | Đúng chữ spec; chỉ ảnh hưởng khi tiêu đề cửa sổ của nó khớp mẫu cuộc họp; thêm kiểm đường dẫn nếu chủ dự án muốn (mục 7) |
| `speaker-worker.exe` nhập thêm `ole32.dll`, `user32.dll` (nạp tĩnh lúc khởi động) dù chưa đọc gì | Bản thử cho thấy chỉ hai DLL hệ thống mới, không `ws2_32`; T8 Step 4 kiểm lại bằng profile release của repo; chi phí nạp đo ở T12 (khởi động worker, RSS) |
| Hai bản trùng logic vòng lặp đọc (macOS, Windows) có thể lệch nhau về sau | Ghi ở "Để kế hoạch sau"; các hàm dùng chung (`read_windows`, `health`, `Stats`) có test riêng; hợp nhất sau khi macOS thử thật xong |
| Gói `chay-05.ps1` **chưa chạy thử** (máy dựng không có PowerShell); `Compress-Archive`, `Start-Process`, định dạng chuỗi `-f` có thể lỗi trên máy thật | Đã cân ngoặc; script viết đơn giản, mỗi bước ghi log; lỗi thì chủ dự án gửi dòng báo lỗi, sửa script (không ảnh hưởng mã của app); T9 Step 4 ghi rõ "chưa chạy thử" |
| Bản ghi cây có tên người, chữ chat; lỡ lọt vào repo công khai | `cay-*.jsonl` chỉ ở `$DATA`; fixture ẩn danh qua `make_fixture.py` (dừng khi còn mẫu cấm), duyệt bản in trước khi chép (T11 Step 5–7); test `fixtures_have_no_account_ids_links_or_paths` quét mọi file trong thư mục fixture; T15 Step 4 quét lần cuối |
| Không có máy Windows để thử trong lúc viết mã | Phần cần máy ghi rõ **(cần chủ dự án)** (T10, T13), không có số liệu giả; mọi mục "chờ chủ dự án" của `05-windows.md` giữ nguyên chữ tới khi có số |
| Số test mong đợi là số đo khi viết kế hoạch trên bản sao của cây hiện tại | Lệch thì ghi số thật; đổi hành vi thì dừng, báo |

## Điều cần chủ dự án quyết

Mặc định ghi ở mỗi mục là cách kế hoạch này làm nếu chủ dự án không nói khác.

1. **Teams Windows vào bản build sẵn khi nào.** Mặc định: chỉ khi T11 đạt cả ba tiêu chí (đủ ba người ≥ 95% ảnh chụp, khớp ≥ 0,85 từng khách ở cả hai bản ghi, không đọc chữ ngoài phạm vi); không đạt thì giữ tắt và quay lại với bản ghi tốt hơn. Cách khác: hạ ngưỡng 0,85 (không khuyến nghị: ưu tiên 2 là hiện đúng tên).
2. **Meet và Zoom trên Windows.** Mặc định: giữ **tắt** như macOS (04 QĐ 16, 32); T13 chỉ ghi cây thật và áp lại tiêu chí; bật là một việc nhỏ riêng khi chủ dự án đồng ý. Cách khác: bật Meet ngay như ứng viên (đọc Chrome/Edge 1–4 lần/giây mà gần như không gán được tên người ở xa).
3. **Windows không có dòng mời cấp quyền** (spec 6.7) và app họp chạy quyền quản trị thì chỉ "Người N". Mặc định: có, không xin nâng quyền. Cách khác: hiện dòng báo "Teams đang chạy với quyền quản trị, không đọc được tên".
4. **Chỉ chạm cửa sổ họp, không bộ nghe sự kiện UI Automation** (QĐ 9). Mặc định: có (giảm nguy cơ làm Chromium bật chế độ trợ năng sớm, và giảm bề mặt). Cách khác: dùng sự kiện thay hỏi vòng nếu T12 cho thấy hỏi vòng quá tốn (cần bằng chứng: kế hoạch 05c).
5. **Windows không nạp UI Automation khi công thức không có mục Windows** (QĐ 6). Mặc định: có. Cách khác: luôn chạy luồng đọc (đơn giản hơn, nhưng nạp COM vô ích cho mọi người dùng Windows).
6. **Lịch cho các bước cần chủ dự án:** T10 khoảng 2 giờ (cùng lần chạy gói 02b khoảng 20–60 phút nếu chưa chạy), T13 khoảng 2–3 giờ (cần hai Gmail, Zoom, Edge nếu thử Edge). Mặc định: T10 trước, T13 sau khi T11 xong.
7. **Nhận app theo tên file chạy, không kiểm đường dẫn** (spec 6.1, QĐ 4 của file 05). Mặc định: theo spec. Cách khác: chỉ chấp nhận file chạy nằm trong `Program Files`, `Program Files (x86)`, `WindowsApps`, `%LocalAppData%` (chặt hơn, nhưng Teams, Zoom, Chrome có nhiều vị trí cài: dễ bỏ sót).
8. **Tiêu chí chi phí đọc trên Windows (T12 Step 2)** do kế hoạch này đề xuất vì spec chưa có số cho Windows: lượt nhanh p90 ≤ 30 ms; app họp thêm ≤ 3% một lõi (1 lần/giây) và ≤ 10% (4 lần/giây); `uia-record` ≤ 3% một lõi. Mặc định: dùng các số này. Không đạt thì một trong ba hướng ở T12 Step 3 (cả cây con một lệnh là mặc định khuyến nghị), mỗi hướng là kế hoạch 05c riêng, chủ dự án chọn.
9. **Chạy gói 02b (`win-pack-02.zip`) cùng lần ngồi máy với `win-pack-05`.** Mặc định: có (một lần ngồi, cùng máy i5, có đủ số nhận giọng và số đọc tên).
10. **Cho phép commit** phần 05 khi xong. Mặc định: chưa (đang để ở working tree như dặn).
