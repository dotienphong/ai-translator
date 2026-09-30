# S6 trên Windows: lấy mẫu VRAM (dedicated và shared) của asr-worker và llama-server mỗi giây.
# Chạy trong một cửa sổ PowerShell riêng, song song với latency-bench; dừng bằng Ctrl+C.
#   powershell -ExecutionPolicy Bypass -File bench\phase0\latency\vram-sample.ps1 -Out bench\phase0\results\latency\vram-<nhãn>.csv
#
# Đọc lớp WMI Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory thay vì Get-Counter: tên lớp và tên thuộc tính
# không đổi theo ngôn ngữ Windows, còn tên counter của Get-Counter thì bị dịch ("GPU Process Memory", "Dedicated Usage").
# Mỗi instance có Name dạng pid_<pid>_luid_<...>_phys_<n>, giá trị tính bằng byte. Một tiến trình có thể có nhiều instance
# (mỗi GPU một cái), nên cộng lại. Cần Windows 10 1709 trở lên.
# Lưu UTF-8 có BOM: Windows PowerShell 5.1 đọc file không BOM bằng bảng mã ANSI nên chú thích có dấu bị sai. Cảnh báo in ra
# console viết không dấu vì console Windows hay dùng bảng mã OEM.
param(
    [string]$Out = "vram.csv",
    [int]$IntervalMs = 1000
)

$class = "Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory"
if (-not (Get-CimClass -ClassName $class -ErrorAction SilentlyContinue)) {
    Write-Warning "Khong co lop WMI $class (can Windows 10 1709 tro len va driver WDDM 2.4 tro len): file $Out se chi co dong tieu de."
}
"time,process,pid,dedicated_mb,shared_mb" | Out-File -Encoding utf8 $Out
$warned = @{}
while ($true) {
    $now = Get-Date -Format o
    $procs = @(foreach ($name in @("asr-worker*", "llama-server")) { Get-Process -Name $name -ErrorAction SilentlyContinue })
    if ($procs.Count -gt 0) {
        $instances = @(Get-CimInstance -ClassName $class -ErrorAction SilentlyContinue)
        foreach ($p in $procs) {
            $mine = @($instances | Where-Object { $_.Name -like "pid_$($p.Id)_*" })
            if ($mine.Count -eq 0) {
                if (-not $warned[$p.Id]) {
                    Write-Warning "Khong co instance GPU nao cho $($p.ProcessName) (pid $($p.Id)): tien trinh chay bang CPU, hoac driver khong co bo dem GPU Process Memory."
                    $warned[$p.Id] = $true
                }
                continue
            }
            $dedicated = ($mine | Measure-Object -Property DedicatedUsage -Sum).Sum
            $shared = ($mine | Measure-Object -Property SharedUsage -Sum).Sum
            "$now,$($p.ProcessName),$($p.Id),$([math]::Round($dedicated / 1MB, 1)),$([math]::Round($shared / 1MB, 1))" |
                Out-File -Append -Encoding utf8 $Out
        }
    }
    Start-Sleep -Milliseconds $IntervalMs
}
