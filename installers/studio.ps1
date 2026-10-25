# PVTA Studio cho Windows: cai PVTA Chat va tien ich PVTA cho Word/Excel/PowerPoint trong mot lan.
# Dung qua Cai-PVTA.bat (do scripts/build-single-installer.sh dung), hoac chay truc tiep:
#   powershell -NoProfile -ExecutionPolicy Bypass -File studio.ps1
# Go tien ich Office: $env:PVTA_UNINSTALL=1 truoc khi chay.
# Tep nay chi dung ky tu ASCII de PowerShell 5.1 doc dung moi ma trang.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

$Repo = 'phandinhdoc-spec/MySoft'
# Co the chot ban cu the bang $env:PVTA_RELEASE_TAG (vi du desktop-v0.1.9); mac dinh lay ban moi nhat.
$Tag = $env:PVTA_RELEASE_TAG
$Home_ = Join-Path $env:USERPROFILE '.phananh-office'
$App = Join-Path $Home_ 'app'
$Certs = Join-Path $Home_ 'certs'
$NodeVer = 'v22.11.0'
$Startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'pvta.vbs'
$RegPath = 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'

function Say($m) { Write-Host "> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "! $m" -ForegroundColor Yellow }

function Stop-Bridge {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*pvta-bridge.mjs*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

# Tim tep chay cua PVTA Chat da cai (NSIS cai theo nguoi dung vao %LOCALAPPDATA%\PVTA; may cai cho moi nguoi dung thi o Program Files).
function Find-ChatExe {
  $dirs = @((Join-Path $env:LOCALAPPDATA 'PVTA'), (Join-Path $env:LOCALAPPDATA 'Programs\PVTA'))
  foreach ($pf in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) { if ($pf) { $dirs += (Join-Path $pf 'PVTA') } }
  foreach ($d in $dirs) {
    foreach ($n in @('pvta-chatbox.exe', 'PVTA.exe')) {
      $f = Join-Path $d $n
      if (Test-Path -LiteralPath $f) { return $f }
    }
  }
  return $null
}

# Tao loi tat PVTA tren Desktop va trong Start Menu (hien o Start > All apps tren Windows 10/11). Ghi de neu da co.
# Dung duong dan that cua thu muc (Known Folder) nen van dung khi Desktop duoc OneDrive chuyen huong.
function New-ChatShortcuts($exe) {
  $made = @()
  try {
    $sh = New-Object -ComObject WScript.Shell
    $targets = @(
      (Join-Path ([Environment]::GetFolderPath('Desktop')) 'PVTA.lnk'),
      (Join-Path ([Environment]::GetFolderPath('Programs')) 'PVTA.lnk')
    )
    foreach ($lnk in $targets) {
      try {
        New-Item -ItemType Directory -Force (Split-Path $lnk) | Out-Null
        $s = $sh.CreateShortcut($lnk)
        $s.TargetPath = $exe
        $s.WorkingDirectory = Split-Path $exe
        $s.IconLocation = "$exe,0"
        $s.Description = 'PVTA - Tro ly AI cho giao vien'
        $s.Save()
        $made += $lnk
      } catch { Warn "Khong tao duoc loi tat $lnk ($($_.Exception.Message))" }
    }
  } catch { Warn "Khong tao duoc loi tat PVTA ($($_.Exception.Message))" }
  return $made
}

function Get-Sha256Expected($sumsText, $name) {
  $line = $sumsText -split "`n" | Where-Object { $_ -match ('\s+\*?' + [regex]::Escape($name) + '\s*$') } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line.Trim() -split '\s+')[0]
}

# ---------------------------------------------------------------- Go tien ich Office
if ($env:PVTA_UNINSTALL) {
  Say 'Dang go tien ich PVTA cho Office...'
  Stop-Bridge
  Remove-Item $Startup -ErrorAction SilentlyContinue
  Remove-ItemProperty -Path $RegPath -Name (Join-Path $App 'manifest.xml') -ErrorAction SilentlyContinue
  Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -like '*PVTA Localhost*' } | Remove-Item -ErrorAction SilentlyContinue
  Remove-Item $App, (Join-Path $Home_ 'node'), $Certs -Recurse -Force -ErrorAction SilentlyContinue
  Say "Da go. Du lieu (skill, cau hinh, hoi thoai) con o $Home_"
  Say 'PVTA Chat go bang Cai dat > Ung dung cua Windows.'
  return
}

# Kien truc that cua Windows. Trinh cai Inno (x86) mo PowerShell 32-bit tren may ARM64,
# luc do PROCESSOR_ARCHITECTURE la x86 va kien truc that nam o PROCESSOR_ARCHITEW6432.
$osArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$IsArm64 = ($osArch -eq 'ARM64')

# Trinh cai PVTA-Studio-Setup.exe da dong goi san PVTA Chat (x64 + ARM64) va tien ich Office:
# thu muc do duoc truyen qua PVTA_PAYLOAD, khong can tai gi tu Internet. Chay truc tiep script nay thi van tai tu GitHub.
$Payload = $env:PVTA_PAYLOAD
if ($Payload -and -not (Test-Path -LiteralPath $Payload)) { $Payload = $null }

# ---------------------------------------------------------------- Tim ban phat hanh
$assets = @(); $sums = ''; $release = $null
function Find-Asset($pattern) { $assets | Where-Object { $_.name -like $pattern } | Select-Object -First 1 }
if ($Payload) {
  Say 'Dung goi co san trong trinh cai (khong can tai tu Internet).'
} else {
$api = if ($Tag) { "https://api.github.com/repos/$Repo/releases/tags/$Tag" } else { "https://api.github.com/repos/$Repo/releases?per_page=30" }
Say 'Tim ban PVTA moi nhat...'
try {
  $response = Invoke-RestMethod $api -Headers @{ 'User-Agent' = 'pvta-installer' }
  if ($Tag) { $release = $response } else {
    $release = @($response) | Where-Object {
      $names = @($_.assets.name)
      -not $_.draft -and -not $_.prerelease -and $_.tag_name -match '^(desktop|chatbox)-v' -and
      ($names -contains 'SHA256SUMS') -and
      ($names -contains 'pvta-office.tar.gz') -and ($names -contains 'office-latest.json')
    } | Sort-Object { [version]($_.tag_name -replace '^(desktop|chatbox)-v','') } -Descending | Select-Object -First 1
    if (-not $release) { throw 'Chua co ban phat hanh du goi Office.' }
  }
}
catch { throw "Khong doc duoc thong tin ban phat hanh tu GitHub. Kiem tra mang roi chay lai. ($($_.Exception.Message))" }
Say "Ban phat hanh: $($release.tag_name)"
$assets = @($release.assets)
$sumsAsset = Find-Asset 'SHA256SUMS'
$sums = if ($sumsAsset) { (Invoke-WebRequest $sumsAsset.browser_download_url -UseBasicParsing).Content } else { '' }
if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
}

$work = Join-Path ([IO.Path]::GetTempPath()) ('pvta-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
$chatInstalled = $false
$officeSwapped = $false
$officeBackup = Join-Path $Home_ 'app.previous'
try {
  # ------------------------------------------------------------ Phan 1: PVTA Chat
  # May ARM64 dung goi ARM64 neu co; neu khong thi dung goi x64 (Windows 11 ARM chay duoc qua gia lap).
  $installer = $null
  if ($Payload) {
    $local = $null
    if ($IsArm64) { $local = Get-ChildItem -LiteralPath $Payload -Filter 'PVTA-Chatbox-*-arm64.exe' | Select-Object -First 1 }
    if (-not $local) { $local = Get-ChildItem -LiteralPath $Payload -Filter 'PVTA-Chatbox-*-x64.exe' | Select-Object -First 1 }
    if (-not $local) { throw 'Trinh cai thieu goi PVTA Chat cho Windows.' }
    Say "Cai PVTA Chat ($($local.Name))..."
    $installer = $local.FullName
  } else {
    $exe = $null
    if ($IsArm64) { $exe = Find-Asset 'PVTA-Chatbox-*-arm64.exe' }
    if (-not $exe) { $exe = Find-Asset 'PVTA-Chatbox-*-x64.exe' }
    if (-not $exe) { $exe = Find-Asset 'PVTA-Chatbox-*-x64-setup.exe' }
    if ($exe) {
      Say "Tai PVTA Chat ($($exe.name))..."
      $installer = Join-Path $work $exe.name
      Invoke-WebRequest $exe.browser_download_url -OutFile $installer -UseBasicParsing
      $expected = Get-Sha256Expected $sums $exe.name
      if (-not $expected) { throw 'Thieu ma SHA256 cua goi PVTA Chat. Chua cai gi ca.' }
      if ((Get-FileHash $installer -Algorithm SHA256).Hash -ne $expected) { throw 'Goi PVTA Chat tai ve khong khop SHA256. Chua cai gi ca.' }
    } else {
      Warn 'Ban phat hanh nay khong co goi PVTA Chat rieng cho Windows. Hay tai PVTA-Studio-Setup tren trang Releases de cai ca Chat va Office.'
    }
  }
  if ($installer) {
    Say 'Cai PVTA Chat (neu Windows hoi xac nhan thi chon Yes)...'
    $installed = Start-Process $installer -ArgumentList '/P','/UPDATE' -Wait -PassThru
    if ($installed.ExitCode -notin @(0, 3010)) { throw "Cai PVTA Chat that bai (ma $($installed.ExitCode))." }
    $chatInstalled = $true
  }

  # ------------------------------------------------------------ Phan 2: tien ich Office
  if (-not $Payload) {
    $tgzAsset = Find-Asset 'pvta-office.tar.gz'
    $jsonAsset = Find-Asset 'office-latest.json'
    if (-not $tgzAsset -or -not $jsonAsset) { throw 'Ban phat hanh thieu goi tien ich Office (pvta-office.tar.gz / office-latest.json).' }
  }

  # Ban cai truoc khi doi ten san pham: bo tac vu khoi dong cu.
  $IsUpgrade = Test-Path $App
  New-Item -ItemType Directory -Force $Home_ | Out-Null

  # Node (dung ban co san >= 20, neu khong tai ban rieng, khong can quyen quan tri)
  $node = $null
  try { $v = & node -p "process.versions.node.split('.')[0]" 2>$null; if ([int]$v -ge 20) { $node = (Get-Command node).Source } } catch {}
  if (-not $node) {
    Say 'Tai Node.js (mot lan)...'
    $arch = if ($IsArm64) { 'arm64' } else { 'x64' }
    $zip = Join-Path $work 'node.zip'
    Invoke-WebRequest "https://nodejs.org/dist/$NodeVer/node-$NodeVer-win-$arch.zip" -OutFile $zip -UseBasicParsing
    Remove-Item (Join-Path $Home_ 'node') -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive $zip -DestinationPath $Home_ -Force
    Rename-Item (Join-Path $Home_ "node-$NodeVer-win-$arch") 'node'
    $node = Join-Path $Home_ 'node\node.exe'
  }

  Say 'Tai tien ich PVTA cho Office...'
  if ($Payload) {
    $tgz = Join-Path $Payload 'pvta-office.tar.gz'
    $meta = [IO.File]::ReadAllText((Join-Path $Payload 'office-latest.json'))
  } else {
    $tgz = Join-Path $work 'pvta-office.tar.gz'
    Invoke-WebRequest $tgzAsset.browser_download_url -OutFile $tgz -UseBasicParsing
    $meta = (Invoke-WebRequest $jsonAsset.browser_download_url -UseBasicParsing).Content
    if ($meta -is [byte[]]) { $meta = [Text.Encoding]::UTF8.GetString($meta) }
  }
  $expected = ($meta | ConvertFrom-Json).sha256
  if ((Get-FileHash $tgz -Algorithm SHA256).Hash -ne $expected) { throw 'Goi tien ich Office khong khop ma kiem tra. Chua thay doi gi tren may.' }
  & tar -tzf $tgz *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Goi tien ich Office khong hop le.' }
  $next = Join-Path $Home_ 'app.next'
  Remove-Item $next -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $next | Out-Null
  & tar -xzf $tgz -C $next --strip-components=1
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $next 'pvta-bridge.mjs'))) { throw 'Goi Office khong hop le. Ban cu van con.' }
  Stop-Bridge
  Remove-Item $officeBackup -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path $App) { Move-Item $App $officeBackup }
  $officeSwapped = $true
  Move-Item $next $App

  # Chung chi HTTPS cuc bo (Office bat buoc add-in dung HTTPS)
  if (-not (Test-Path (Join-Path $Certs 'localhost.pfx'))) {
    Say 'Tao chung chi cuc bo (Windows se hoi xac nhan mot lan - chon Yes)...'
    New-Item -ItemType Directory -Force $Certs | Out-Null
    $c = New-SelfSignedCertificate -Subject 'CN=PVTA Localhost' -DnsName 'localhost' -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(2)
    $pw = ConvertTo-SecureString 'pvta' -AsPlainText -Force
    Export-PfxCertificate -Cert $c -FilePath (Join-Path $Certs 'localhost.pfx') -Password $pw | Out-Null
    $cer = Join-Path $Certs 'localhost.cer'
    Export-Certificate -Cert $c -FilePath $cer | Out-Null
    Import-Certificate -FilePath $cer -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
    Remove-Item "Cert:\CurrentUser\My\$($c.Thumbprint)" -ErrorAction SilentlyContinue
  }

  # Dang ky add-in voi Word/Excel/PowerPoint (Office doc duong dan manifest trong registry)
  New-Item -Path $RegPath -Force | Out-Null
  $manifest = Join-Path $App 'manifest.xml'
  New-ItemProperty -Path $RegPath -Name $manifest -Value $manifest -PropertyType String -Force | Out-Null

  # Tu chay nen khi dang nhap (PVTA_RELEASE_REPO de ban nen tu cap nhat tu dung repo nay)
  $vbs = @"
Set sh = CreateObject("WScript.Shell")
sh.Environment("Process")("PVTA_WEB") = "$App\web"
sh.Environment("Process")("PVTA_BUNDLED_SKILLS") = "$App\skills"
sh.Environment("Process")("PVTA_RELEASE_REPO") = "$Repo"
sh.Run """$node"" ""$App\pvta-bridge.mjs""", 0, False
"@
  # UTF-16 (Unicode): giu dung duong dan khi ten nguoi dung Windows co dau tieng Viet.
  Set-Content -Path $Startup -Value $vbs -Encoding Unicode
  Start-Process wscript.exe -ArgumentList "`"$Startup`""

  $ok = $false
  for ($i = 0; $i -lt 20; $i++) {
    try { Invoke-WebRequest 'https://localhost:52730/health' -UseBasicParsing | Out-Null; $ok = $true; break } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ok) { Warn "Tien ich chua khoi dong duoc. Xem nhat ky: $Home_\bridge.log" }

  # ------------------------------------------------------------ Phan 3: cong cu AI
  # Cai lan dau (hoac may chua co cong cu nao): mo cua so chon cong cu AI trong goi cai.
  # PVTA_NO_GUI=1 bo qua cua so; PVTA_INSTALL_CLI=none|claude|codex|agy cai thang, khong hoi.
  $have = @('claude', 'codex', 'agy') | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue }
  $choice = $env:PVTA_INSTALL_CLI
  $wizard = Join-Path $App 'wizard.ps1'
  $installedNow = $false
  if (-not $choice -and -not $env:PVTA_NO_GUI -and [Environment]::UserInteractive -and (Test-Path $wizard) -and ((-not $IsUpgrade) -or (-not $have))) {
    try {
      $res = & $wizard -NodePath $node -AppDir $App -HomeDir $Home_ | Select-Object -Last 1
      if ($res -and $res.PSObject.Properties['Completed']) {
        $installedNow = $true
        $have = @($res.Installed)
        if (-not $res.Completed) { Warn 'Ban chua hoan tat buoc chon cong cu AI. Chay lai Cai-PVTA.bat de chon lai bat cu luc nao.' }
      }
    } catch { Warn 'Khong mo duoc cua so chon cong cu AI. Co the cai claude, codex hoac agy thu cong, hoac nhap khoa API trong Cai dat cua PVTA.' }
  } elseif ($choice -and $choice -ne 'none' -and -not ($have -contains $choice)) {
    $cmd = switch ($choice) {
      'claude' { 'irm https://claude.ai/install.ps1 | iex' }
      'agy'    { 'irm https://antigravity.google/cli/install.ps1 | iex' }
      'codex'  { if (Get-Command npm -ErrorAction SilentlyContinue) { 'npm install -g @openai/codex' } else { $null } }
      default  { $null }
    }
    if ($cmd) {
      Say "Cai ${choice}: $cmd"
      try { Invoke-Expression $cmd; $installedNow = $true; $have = @($have) + @($choice) }
      catch { Warn "Chua cai duoc $choice tu dong. Xem huong dan trong Cai dat cua PVTA, muc AI tren may." }
    } else { Warn "Khong cai duoc $choice tu dong (codex can npm / Node.js)." }
  }
  # Cong cu vua cai nam trong thu muc moi cua PATH: khoi dong lai bridge de no thay.
  if ($installedNow) {
    Stop-Bridge
    Start-Process wscript.exe -ArgumentList "`"$Startup`""
  }

  Write-Host ''
  Say 'Da cai xong.'
  if ($chatInstalled) {
    $chatExe = Find-ChatExe
    if ($chatExe) {
      $links = New-ChatShortcuts $chatExe
      if ($links.Count -gt 0) { Say 'Da tao bieu tuong PVTA tren Desktop va trong Start Menu.' }
      Start-Process $chatExe
    } else { Write-Host 'Mo PVTA tu Start Menu.' }
  }
  Write-Host '   Tien ich Office: thoat han Word / Excel / PowerPoint roi mo lai -> Insert -> Add-ins -> My Add-ins -> PVTA.'
  if (-not $have) { Warn 'Chua thay claude, codex hoac agy tren may. Cai va dang nhap mot cong cu (hoac nhap khoa API trong Cai dat cua PVTA) de PVTA tra loi duoc.' }
} catch {
  if ($officeSwapped) {
    Stop-Bridge
    Remove-Item $App -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $officeBackup) { Move-Item $officeBackup $App }
    if (Test-Path $Startup) { Start-Process wscript.exe -ArgumentList "`"$Startup`"" }
  }
  throw
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
