# Test các hàm thuần lồng trong website/src/public/install.ps1: trích chúng bằng AST (không chạy phần cài), chạy được trên
# mọi hệ điều hành có PowerShell 7 (pwsh). Dùng bởi test/install-ps1.test.mjs; in "OK <tên>" cho mỗi ca, thoát khác 0 nếu lỗi.
param([Parameter(Mandatory)][string]$Script)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($Script, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 2 }
$outer = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Install-AiTranslator' }, $true)[0]
$inner = $outer.Body.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
foreach ($f in $inner) { if ($f.Name -in 'Test-VersionText', 'Get-ExpectedHash', 'Get-InstallerUrl', 'Select-Language', 'Get-InstallDirCandidates') { Invoke-Expression $f.Extent.Text } }
$failed = 0
function Check([string]$name, $actual, $expected) {
    if ($actual -ceq $expected) { Write-Output "OK $name" } else { Write-Output "FAIL $name : got [$actual] expected [$expected]"; $script:failed++ }
}
Check 'version stable' (Test-VersionText '0.1.0') $true
Check 'version beta' (Test-VersionText '1.12.3-beta.4') $true
Check 'version chèn đường dẫn' (Test-VersionText '1.0.0/../../x') $false
Check 'version chèn lệnh' (Test-VersionText '1.0.0; calc') $false
Check 'version rỗng' (Test-VersionText '') $false
$h = 'a' * 64
$sums = "$('b' * 64)  Other.exe`r`n$h  AI Translator_0.1.0_x64-setup.exe`r`n"
Check 'hash đúng dòng' (Get-ExpectedHash $sums 'AI Translator_0.1.0_x64-setup.exe') $h
Check 'hash dấu sao nhị phân' (Get-ExpectedHash "$h *AI Translator_0.1.0_x64-setup.exe" 'AI Translator_0.1.0_x64-setup.exe') $h
Check 'hash chữ hoa -> thường' (Get-ExpectedHash ("A" * 64 + "  x.exe") 'x.exe') $h
Check 'hash thiếu dòng' (Get-ExpectedHash $sums 'Missing.exe') $null
Check 'hash tên khác hoa thường' (Get-ExpectedHash $sums 'ai translator_0.1.0_x64-setup.exe') $null
Check 'hash không đủ 64' (Get-ExpectedHash 'abc  x.exe' 'x.exe') $null
Check 'url có khoảng trắng' (Get-InstallerUrl 'https://r.example' '0.1.0' 'AI Translator_0.1.0_x64-setup.exe') 'https://r.example/0.1.0/AI%20Translator_0.1.0_x64-setup.exe'
Check 'ngôn ngữ ép vi' (Select-Language 'vi' 'en-US' 'US') 'vi'
Check 'ngôn ngữ ép en' (Select-Language 'en' 'vi-VN' 'VN') 'en'
Check 'ngôn ngữ giao diện vi' (Select-Language '' 'vi-VN' 'US') 'vi'
Check 'vùng Việt Nam' (Select-Language '' 'en-US' 'VN') 'vi'
Check 'mặc định en' (Select-Language '' 'en-US' 'US') 'en'
# Lỗi thật của khách (2026-10-09): registry ghi InstallLocation kèm nháy kép, Join-Path báo "drive '\"C' does not exist"
$quoted = '"C:\Users\dohuu\AppData\Local\AI Translator"'
$c = @(Get-InstallDirCandidates $quoted 'C:\Users\dohuu\AppData\Local' 'AI Translator')
Check 'InstallLocation có nháy kép được bỏ nháy' $c[0] 'C:\Users\dohuu\AppData\Local\AI Translator'
Check 'có thư mục mặc định dự phòng' $c.Count 2
Check 'InstallLocation sạch giữ nguyên' (@(Get-InstallDirCandidates 'D:\Apps\AI Translator' 'C:\L' 'AI Translator'))[0] 'D:\Apps\AI Translator'
Check 'InstallLocation rỗng: chỉ còn mặc định' (@(Get-InstallDirCandidates $null 'C:\L' 'AI Translator')).Count 1
Check 'InstallLocation chỉ có nháy: bỏ qua' (@(Get-InstallDirCandidates '""' 'C:\L' 'AI Translator')).Count 1
Check 'khoảng trắng và nháy lẫn lộn' (@(Get-InstallDirCandidates ' "D:\X" ' 'C:\L' 'AI Translator'))[0] 'D:\X'
foreach ($path in $c) { Check "ứng viên không chứa nháy: $path" ($path.Contains('"')) $false }
if ($failed -gt 0) { exit 1 }
