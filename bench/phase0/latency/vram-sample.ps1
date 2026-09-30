# S6 trên Windows: lấy mẫu VRAM (dedicated và shared) của asr-worker và llama-server mỗi giây.
# Chạy trong một cửa sổ PowerShell riêng, song song với latency-bench; dừng bằng Ctrl+C.
#   powershell -ExecutionPolicy Bypass -File bench\phase0\latency\vram-sample.ps1 -Out bench\phase0\results\latency\vram-<nhãn>.csv
param(
    [string]$Out = "vram.csv",
    [int]$IntervalMs = 1000
)

"time,process,pid,dedicated_mb,shared_mb" | Out-File -Encoding utf8 $Out
while ($true) {
    $now = Get-Date -Format o
    foreach ($name in @("asr-worker*", "llama-server")) {
        foreach ($p in Get-Process -Name $name -ErrorAction SilentlyContinue) {
            $base = "\GPU Process Memory(pid_$($p.Id)_*)"
            $dedicated = (Get-Counter "$base\Dedicated Usage" -ErrorAction SilentlyContinue).CounterSamples |
                Measure-Object -Property CookedValue -Sum
            $shared = (Get-Counter "$base\Shared Usage" -ErrorAction SilentlyContinue).CounterSamples |
                Measure-Object -Property CookedValue -Sum
            "$now,$($p.ProcessName),$($p.Id),$([math]::Round($dedicated.Sum / 1MB, 1)),$([math]::Round($shared.Sum / 1MB, 1))" |
                Out-File -Append -Encoding utf8 $Out
        }
    }
    Start-Sleep -Milliseconds $IntervalMs
}
