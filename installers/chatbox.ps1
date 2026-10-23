$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = 'phandinhdoc-spec/MySoft'
$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
$asset = $release.assets | Where-Object { $_.name -like 'PVTA-Chatbox-*-x64.exe' } | Select-Object -First 1
if (-not $asset) { throw 'Chua co goi PVTA Chatbox cho Windows tren GitHub Releases.' }
$taskTemp = Join-Path ([IO.Path]::GetTempPath()) ('pvta-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $taskTemp | Out-Null
try {
    $installer = Join-Path $taskTemp $asset.name
    Invoke-WebRequest $asset.browser_download_url -OutFile $installer
    $base = $asset.browser_download_url.Substring(0,$asset.browser_download_url.LastIndexOf('/'))
    $sums = (Invoke-WebRequest "$base/SHA256SUMS").Content
    $line = $sums -split "`n" | Where-Object { $_ -match ('\s+\*?' + [regex]::Escape($asset.name) + '\s*$') } | Select-Object -First 1
    if (-not $line) { throw 'Thieu ma SHA256 cua goi cai.' }
    $expected = ($line.Trim() -split '\s+')[0]
    if ((Get-FileHash $installer -Algorithm SHA256).Hash -ne $expected) { throw 'Goi tai ve khong khop SHA256.' }
    Start-Process $installer -Wait
    $wizard = Join-Path $taskTemp 'setup.ps1'
    Invoke-WebRequest "https://raw.githubusercontent.com/$repo/main/installers/setup.ps1" -OutFile $wizard
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wizard
} finally { Remove-Item -LiteralPath $taskTemp -Recurse -Force }
