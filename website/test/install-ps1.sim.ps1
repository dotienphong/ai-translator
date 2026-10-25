# Mô phỏng install.ps1 bằng PowerShell 7 trên máy bất kỳ (test/install-ps1.test.mjs gọi file này khi có `pwsh`): bỏ khối kiểm
# nền tảng, giả Invoke-WebRequest, Invoke-RestMethod và Start-Process, rồi chạy Install-AiTranslator. In một dòng `RESULT:<json>`
# gồm: có chạy hết không, lỗi (nếu có), số lần chạy bộ cài, các URL đã gọi. Không đụng mạng, không cài gì.
#   pwsh -NoProfile -File install-ps1.sim.ps1 -Script <install.ps1> -Mode <kịch bản> [-Beta]
# Kịch bản: pinned-good (script đã ghim, file đúng), pinned-evil (đã ghim, R2 bị đổi cả file lẫn SHA256SUMS), unpinned-good,
# unpinned-evil (chưa ghim: tin mã nằm cạnh file).
param([string]$Script, [string]$Mode, [switch]$Beta)
$ErrorActionPreference = 'Stop'
$wantBeta = [bool]$Beta
$env:AI_TRANSLATOR_LANG = 'en'
$env:PROCESSOR_ARCHITECTURE = 'AMD64'
$local = Join-Path ([IO.Path]::GetTempPath()) ('ps-sim-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $local | Out-Null
$env:LOCALAPPDATA = $local
$text = Get-Content -Raw -LiteralPath $Script
$text = [regex]::Replace($text, '(?s)\s*if \(\$isCore -and -not \$IsWindows\) \{.*?\n        \}\n', "`n")
$text = [regex]::Replace($text, '(?m)^Install-AiTranslator -Beta:\$Beta -NoOpen\s*$', '')
$good = [Text.Encoding]::UTF8.GetBytes('đây là bộ cài thật')
$evil = [Text.Encoding]::UTF8.GetBytes('đây là bộ cài do kẻ tấn công đặt vào R2')
function Sha([byte[]]$b) { ([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData($b)) -replace '-', '').ToLowerInvariant() }
$goodSha = Sha $good
$evilSha = Sha $evil
$pin = $null
switch ($Mode) {
    'pinned-good'   { $bytes = $good; $sums = "$goodSha  AI Translator_9.9.9_x64-setup.exe"; $pin = $goodSha }
    'pinned-evil'   { $bytes = $evil; $sums = "$evilSha  AI Translator_9.9.9_x64-setup.exe"; $pin = $goodSha }
    'unpinned-good' { $bytes = $good; $sums = "$goodSha  AI Translator_9.9.9_x64-setup.exe" }
    'unpinned-evil' { $bytes = $evil; $sums = "$evilSha  AI Translator_9.9.9_x64-setup.exe" }
    default { throw "kịch bản lạ: $Mode" }
}
if ($pin) {
    $text = $text -replace "(?m)^( *\`$PinVersion = )''", "`$1'9.9.9'"
    $text = $text -replace "(?m)^( *\`$PinSha256 = )''", "`$1'$pin'"
}
Invoke-Expression $text
$script:requested = @()
$script:started = 0
function Invoke-RestMethod { param([switch]$UseBasicParsing, $Uri) $script:requested += $Uri; [pscustomobject]@{ version = '9.9.9' } }
function Invoke-WebRequest { param([switch]$UseBasicParsing, $Uri, $OutFile)
    $script:requested += $Uri
    if ($OutFile) { [IO.File]::WriteAllBytes($OutFile, $bytes) } else { [pscustomobject]@{ Content = $sums } } }
function Unblock-File { param($LiteralPath) }
function Start-Process { param($FilePath, $ArgumentList, [switch]$Wait, [switch]$PassThru)
    $script:started++
    [IO.File]::WriteAllText($env:LOCALAPPDATA + '\' + 'AI Translator' + '\' + 'meeting-translator.exe', 'x')
    [pscustomobject]@{ ExitCode = 0 } }
$out = & { Install-AiTranslator -Beta:$wantBeta -NoOpen *>&1 } | Out-String
$urls = @($script:requested | ForEach-Object { $_ -replace 'https://releases.aitranslator.vn/', '' })
$result = [ordered]@{ started = $script:started; requested = $urls; output = $out }
Write-Output ('RESULT:' + ($result | ConvertTo-Json -Compress -Depth 4))
Remove-Item -Recurse -Force $local -ErrorAction SilentlyContinue
