# Cài AI Translator trên Windows bằng một dòng lệnh (mở PowerShell, dán, Enter):
#
#   irm https://aitranslator.io.vn/install.ps1 | iex
#
# Kênh beta:  & ([scriptblock]::Create((irm https://aitranslator.io.vn/install.ps1))) -Beta
# Xem trước khi chạy (in script ra, đọc, rồi mới chạy):  $s = irm https://aitranslator.io.vn/install.ps1; $s | more; iex $s
#
# Script làm gì (và chỉ làm vậy):
#   1. Kiểm máy: Windows 10/11 bản 64-bit (x64).
#   2. Đọc số phiên bản mới nhất ở https://releases.aitranslator.io.vn/<kênh>/latest.json.
#   3. Tải bộ cài .exe của phiên bản đó và mã SHA-256 của nó từ cùng nơi, rồi đối chiếu.
#   4. Chạy bộ cài ở chế độ im lặng (cài cho riêng tài khoản của bạn, không cần quyền quản trị, không UAC).
#   5. Mở AI Translator, rồi xóa file tải về.
# Script không sửa gì ngoài thư mục cài và thư mục tạm của nó, không gửi dữ liệu nào đi.
#
# Vì sao không bị SmartScreen chặn: SmartScreen chỉ kiểm file mang dấu "tải từ internet" (Mark of the Web) khi mở từ
# Explorer. File tải bằng PowerShell không mang dấu đó, và bộ cài được chạy từ PowerShell. Script cũng gỡ dấu đó khỏi
# file tải về phòng khi môi trường của bạn có gắn. Lưu ý: nếu máy bật Smart App Control (Windows 11) ở chế độ chặn, nó
# vẫn chặn mọi bộ cài chưa ký mã; xem aitranslator.io.vn/huong-dan/cai-dat-windows/.
#
# Biến môi trường (không bắt buộc):
#   AI_TRANSLATOR_CHANNEL    stable (mặc định) hoặc beta; -Beta cũng được
#   AI_TRANSLATOR_NO_OPEN=1  cài xong không mở app (cũng có -NoOpen)
#   AI_TRANSLATOR_LANG       vi hoặc en: ép ngôn ngữ thông báo (mặc định theo ngôn ngữ của Windows)
#
# Toàn bộ script nằm trong một hàm chỉ được gọi ở dòng cuối, và không dùng `exit` (để không đóng cửa sổ PowerShell của bạn).

[CmdletBinding()]
param(
    [switch]$Beta,
    [switch]$NoOpen
)

function Install-AiTranslator {
    param([switch]$Beta, [switch]$NoOpen)

    $ErrorActionPreference = 'Stop'
    $BaseUrl = 'https://releases.aitranslator.io.vn'
    $Product = 'AI Translator'
    $MainExe = 'meeting-translator.exe'

    # ---------------------------------------------------------------- hàm thuần (test được trên mọi hệ điều hành)
    function Test-VersionText([string]$Text) {
        return [bool]($Text -match '^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$')
    }
    function Get-ExpectedHash([string]$SumsText, [string]$FileName) {
        foreach ($line in ($SumsText -split "`r?`n")) {
            if ($line -match '^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$' -and $Matches[2] -ceq $FileName) {
                return $Matches[1].ToLowerInvariant()
            }
        }
        return $null
    }
    function Get-InstallerUrl([string]$Base, [string]$Version, [string]$Name) {
        return ('{0}/{1}/{2}' -f $Base, $Version, ($Name -replace ' ', '%20'))
    }
    # Bộ cài NSIS của Tauri ghi InstallLocation vào registry KÈM dấu nháy kép ("C:\Users\...\AI Translator"). Bỏ nháy và khoảng
    # trắng, rồi trả danh sách thư mục ứng viên theo thứ tự thử: giá trị registry (nếu hợp lệ), rồi thư mục mặc định.
    function Get-InstallDirCandidates([string]$Registry, [string]$LocalAppData, [string]$ProductName) {
        $list = @()
        if ($Registry) {
            $clean = $Registry.Trim().Trim('"').Trim()
            if ($clean) { $list += $clean }
        }
        if ($LocalAppData) { $list += ($LocalAppData.TrimEnd('\', '/') + '\' + $ProductName) } # nối chuỗi, không Join-Path: tránh PowerShell tìm "ổ đĩa" trong chuỗi lạ
        return $list
    }
    function Select-Language([string]$Forced, [string]$UiCulture, [string]$Region) {
        if ($Forced -eq 'vi' -or $Forced -eq 'en') { return $Forced }
        if ($UiCulture -like 'vi*' -or $Region -eq 'VN') { return 'vi' }
        return 'en'
    }

    $forced = $env:AI_TRANSLATOR_LANG
    $uiCulture = ''
    $region = ''
    try { $uiCulture = (Get-UICulture).Name } catch { }
    try { $region = [System.Globalization.RegionInfo]::CurrentRegion.TwoLetterISORegionName } catch { }
    $lang = Select-Language $forced $uiCulture $region

    function Say([string]$vi, [string]$en) {
        if ($lang -eq 'vi') { Write-Host $vi } else { Write-Host $en }
    }
    function Fail([string]$vi, [string]$en) {
        throw $(if ($lang -eq 'vi') { $vi } else { $en })
    }

    # Console của Windows PowerShell mặc định không in được tiếng Việt có dấu: tạm đổi sang UTF-8.
    $oldEncoding = $null
    try { $oldEncoding = [Console]::OutputEncoding; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
    $oldProgress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    $work = $null

    try {
        $channel = if ($env:AI_TRANSLATOR_CHANNEL) { $env:AI_TRANSLATOR_CHANNEL } else { 'stable' }
        if ($Beta) { $channel = 'beta' }
        if ($channel -ne 'stable' -and $channel -ne 'beta') { Fail 'kênh phải là stable hoặc beta.' 'channel must be stable or beta.' }

        # --- 1. Kiểm máy ---
        $isCore = $PSVersionTable.PSEdition -eq 'Core'
        if ($isCore -and -not $IsWindows) {
            Fail 'script này chỉ dành cho Windows. macOS: xem aitranslator.io.vn/tai-xuong/' 'this script is for Windows only. macOS: see aitranslator.io.vn/en/download/'
        }
        if ([Environment]::OSVersion.Version.Major -lt 10) { Fail 'AI Translator cần Windows 10 hoặc 11.' 'AI Translator needs Windows 10 or 11.' }
        $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
        if ($arch -ne 'AMD64') {
            Fail "AI Translator cần Windows 64-bit (x64); máy bạn là $arch. Chưa có bản cho Windows ARM64." "AI Translator needs 64-bit Windows (x64); this PC is $arch. There is no Windows ARM64 build yet."
        }
        try {
            $ram = (Get-CimInstance -ClassName Win32_ComputerSystem).TotalPhysicalMemory
            if ($ram -lt 7.5GB) {
                Say 'Cảnh báo: máy có RAM dưới 8 GB; app sẽ báo lý do và không cho tải model.' 'Warning: this PC has less than 8 GB of RAM; the app will say so and will not let you download models.'
            }
        } catch { }

        # TLS 1.2 (Windows PowerShell 5.1 trên máy cũ mặc định TLS 1.0/1.1, R2 không nhận)
        try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

        # --- 2. Phiên bản mới nhất của kênh ---
        Say "Đang tìm phiên bản mới nhất ($channel)..." "Looking up the latest version ($channel)..."
        $manifestUrl = "$BaseUrl/$channel/latest.json"
        $manifest = $null
        try { $manifest = Invoke-RestMethod -UseBasicParsing -Uri $manifestUrl } catch {
            $hint = if ($channel -eq 'stable') { '; nếu bạn đang dùng bản beta thì thêm -Beta' } else { '' }
            $hintEn = if ($channel -eq 'stable') { '; if you are on the beta, add -Beta' } else { '' }
            Fail "không đọc được $manifestUrl (mất mạng, hoặc kênh $channel chưa có bản nào). Kiểm tra mạng và thử lại$hint." `
                "could not read $manifestUrl (no network, or the $channel channel has no release yet). Check your network and try again$hintEn."
        }
        $version = [string]$manifest.version
        if (-not (Test-VersionText $version)) { Fail 'latest.json không có số phiên bản hợp lệ.' 'latest.json has no valid version number.' }

        $setupName = "${Product}_${version}_x64-setup.exe"
        $setupUrl = Get-InstallerUrl $BaseUrl $version $setupName
        $sumsUrl = "$BaseUrl/$version/SHA256SUMS-windows.txt"

        # --- 3. Tải và kiểm SHA-256 ---
        $work = Join-Path ([IO.Path]::GetTempPath()) ('ai-translator-install-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $work | Out-Null
        $setup = Join-Path $work $setupName
        Say "Đang tải $Product $version (khoảng 22 MB)..." "Downloading $Product $version (about 22 MB)..."
        try { Invoke-WebRequest -UseBasicParsing -Uri $setupUrl -OutFile $setup } catch { Fail "không tải được $setupUrl" "could not download $setupUrl" }
        $sumsText = ''
        try { $sumsText = (Invoke-WebRequest -UseBasicParsing -Uri $sumsUrl).Content } catch { Fail "không tải được $sumsUrl" "could not download $sumsUrl" }
        if ($sumsText -is [byte[]]) { $sumsText = [Text.Encoding]::UTF8.GetString($sumsText) }
        $expected = Get-ExpectedHash $sumsText $setupName
        if (-not $expected) { Fail "SHA256SUMS-windows.txt không có mã của $setupName." "SHA256SUMS-windows.txt has no checksum for $setupName." }
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $setup).Hash.ToLowerInvariant()
        if ($actual -ne $expected) {
            Fail "SHA-256 của file tải về không khớp (mong đợi $expected, nhận $actual). Không cài; thử lại, nếu vẫn lệch thì báo support@aitranslator.io.vn." `
                "the downloaded file's SHA-256 does not match (expected $expected, got $actual). Nothing was installed; retry, and if it still differs write to support@aitranslator.io.vn."
        }
        Say 'Đã kiểm SHA-256: khớp.' 'SHA-256 checked: it matches.'
        try { Unblock-File -LiteralPath $setup } catch { }

        # --- 4. Cài im lặng, cho riêng tài khoản này ---
        if (Get-Process -Name ($MainExe -replace '\.exe$', '') -ErrorAction SilentlyContinue) {
            Say "$Product đang chạy; bộ cài sẽ đóng nó để cập nhật." "$Product is running; the installer will close it to update."
        }
        Say 'Đang cài...' 'Installing...'
        $proc = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
        if ($proc.ExitCode -ne 0) { Fail "bộ cài báo lỗi (mã $($proc.ExitCode))." "the installer failed (exit code $($proc.ExitCode))." }

        $registryDir = $null
        try { $registryDir = (Get-ItemProperty -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$Product" -Name InstallLocation).InstallLocation } catch { }
        $installDir = $null
        $exe = $null
        foreach ($candidate in (Get-InstallDirCandidates $registryDir $env:LOCALAPPDATA $Product)) {
            $try = $candidate.TrimEnd('\', '/') + '\' + $MainExe
            if (Test-Path -LiteralPath $try) { $installDir = $candidate; $exe = $try; break }
        }
        if (-not $exe) { Fail "bộ cài chạy xong nhưng không thấy $MainExe (đã tìm ở $registryDir và %LOCALAPPDATA%\$Product)." "the installer finished but $MainExe was not found (looked in $registryDir and %LOCALAPPDATA%\$Product)." }
        Say "Đã cài $Product $version tại $installDir." "Installed $Product $version at $installDir."

        # --- 5. Mở app ---
        if ($NoOpen -or $env:AI_TRANSLATOR_NO_OPEN -eq '1') {
            Say 'Mở app từ menu Start.' 'Open the app from the Start menu.'
            return
        }
        Say "Đang mở $Product..." "Opening $Product..."
        Start-Process -FilePath $exe
    }
    catch {
        Write-Host ''
        Write-Host ($(if ($lang -eq 'vi') { 'Lỗi: ' } else { 'Error: ' }) + $_.Exception.Message) -ForegroundColor Red
    }
    finally {
        if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
        $ProgressPreference = $oldProgress
        if ($oldEncoding) { try { [Console]::OutputEncoding = $oldEncoding } catch { } }
    }
}

Install-AiTranslator -Beta:$Beta -NoOpen:$NoOpen
