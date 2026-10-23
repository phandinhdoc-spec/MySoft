# PVTA – cài một lệnh cho Windows (PowerShell):
#   irm https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/install/install.ps1 | iex
# Gỡ: $env:PVTA_UNINSTALL=1; irm ...install.ps1 | iex
$ErrorActionPreference = "Stop"
$Repo = "phandinhdoc-spec/MySoft"
# PVTA_BRANCH: thu ban tren nhanh khac (mac dinh main). Vi du: $env:PVTA_BRANCH="windows-wizard-icon"
$Branch = if ($env:PVTA_BRANCH) { $env:PVTA_BRANCH } else { "main" }
$Home_ = Join-Path $env:USERPROFILE ".phananh-office"
$App = Join-Path $Home_ "app"
$Certs = Join-Path $Home_ "certs"
$NodeVer = "v22.11.0"
$Startup = Join-Path ([Environment]::GetFolderPath("Startup")) "pvta.vbs"
$RegPath = "HKCU:\Software\Microsoft\Office\16.0\WEF\Developer"

function Say($m) { Write-Host "> $m" -ForegroundColor Cyan }

function Stop-Bridge {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*pvta-bridge.mjs*" -or $_.CommandLine -like "*pvta-bridge.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}
Stop-Bridge
# Ban cai truoc khi doi ten san pham: bo tac vu khoi dong cu.
Remove-Item (Join-Path ([Environment]::GetFolderPath("Startup")) "pvta.vbs") -ErrorAction SilentlyContinue
# Thu muc app da co = dang cap nhat/cai lai; chua co = cai lan dau (hien cua so chon cong cu AI).
$IsUpgrade = Test-Path $App

if ($env:PVTA_UNINSTALL) {
  Say "Dang go PVTA..."
  Remove-Item $Startup -ErrorAction SilentlyContinue
  Remove-ItemProperty -Path $RegPath -Name (Join-Path $App "manifest.xml") -ErrorAction SilentlyContinue
  Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -like "*PVTA Localhost*" } | Remove-Item -ErrorAction SilentlyContinue
  Remove-Item $App, (Join-Path $Home_ "node"), $Certs -Recurse -Force -ErrorAction SilentlyContinue
  Say "Da go."
  return
}

New-Item -ItemType Directory -Force $Home_ | Out-Null

# 1. Node
$node = $null
try { $v = & node -p "process.versions.node.split('.')[0]" 2>$null; if ([int]$v -ge 20) { $node = (Get-Command node).Source } } catch {}
if (-not $node) {
  Say "Tai Node.js (mot lan)..."
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  $zip = Join-Path $env:TEMP "node.zip"
  Invoke-WebRequest "https://nodejs.org/dist/$NodeVer/node-$NodeVer-win-$arch.zip" -OutFile $zip
  Remove-Item (Join-Path $Home_ "node") -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive $zip -DestinationPath $Home_ -Force
  Rename-Item (Join-Path $Home_ "node-$NodeVer-win-$arch") "node"
  $node = Join-Path $Home_ "node\node.exe"
}

# 2. Tai PVTA
Say "Tai PVTA..."
$tgz = Join-Path $env:TEMP "pvta.tar.gz"
if ($env:PVTA_LOCAL_TGZ) {
  # Ban dong goi san (file .exe): khong can tai.
  Copy-Item $env:PVTA_LOCAL_TGZ $tgz -Force
} else {
  Invoke-WebRequest "https://raw.githubusercontent.com/$Repo/$Branch/install/pvta.tar.gz" -OutFile $tgz
}
Remove-Item $App -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $App | Out-Null
tar -xzf $tgz -C $App --strip-components=1

# 3. Chung chi HTTPS cuc bo
if (-not (Test-Path (Join-Path $Certs "localhost.pfx"))) {
  Say "Tao chung chi cuc bo (Windows se hoi xac nhan mot lan - chon Yes)..."
  New-Item -ItemType Directory -Force $Certs | Out-Null
  $c = New-SelfSignedCertificate -Subject "CN=PVTA Localhost" -DnsName "localhost" -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(2)
  $pw = ConvertTo-SecureString "pvta" -AsPlainText -Force
  Export-PfxCertificate -Cert $c -FilePath (Join-Path $Certs "localhost.pfx") -Password $pw | Out-Null
  $cer = Join-Path $Certs "localhost.cer"
  Export-Certificate -Cert $c -FilePath $cer | Out-Null
  Import-Certificate -FilePath $cer -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
  Remove-Item "Cert:\CurrentUser\My\$($c.Thumbprint)" -ErrorAction SilentlyContinue
}

# 4. Dang ky add-in voi Word/Excel/PowerPoint (Office doc duong dan manifest trong registry)
New-Item -Path $RegPath -Force | Out-Null
$manifest = Join-Path $App "manifest.xml"
New-ItemProperty -Path $RegPath -Name $manifest -Value $manifest -PropertyType String -Force | Out-Null

# 5. Tu chay nen khi dang nhap
$vbs = @"
Set sh = CreateObject("WScript.Shell")
sh.Environment("Process")("PVTA_WEB") = "$App\web"
sh.Environment("Process")("PVTA_BUNDLED_SKILLS") = "$App\skills"
sh.Run """$node"" ""$App\pvta-bridge.mjs""", 0, False
"@
# UTF-16 (Unicode): giu dung duong dan khi ten nguoi dung Windows co dau tieng Viet.
Set-Content -Path $Startup -Value $vbs -Encoding Unicode
Start-Process wscript.exe -ArgumentList "`"$Startup`""

# 6. Kiem tra
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  try { Invoke-WebRequest "https://localhost:52730/health" -UseBasicParsing | Out-Null; $ok = $true; break } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ok) { Write-Host "PVTA chua khoi dong duoc." -ForegroundColor Red; return }
# 7. Cong cu AI. Cai lan dau (hoac may chua co cong cu nao): hien cua so huong dan 3 buoc
#    (chon cong cu -> tu cai -> dang nhap). PVTA_INSTALL_CLI=none bo qua; PVTA_NO_GUI=1 dung ban hoi bang chu.
$have = @("claude","codex","agy") | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue }
$choice = $env:PVTA_INSTALL_CLI
$wizard = Join-Path $App "wizard.ps1"
$guiShown = $false
if (-not $choice -and -not $env:PVTA_NO_GUI -and [Environment]::UserInteractive -and (Test-Path $wizard) -and ((-not $IsUpgrade) -or (-not $have))) {
  try {
    $res = & $wizard -NodePath $node -AppDir $App -HomeDir $Home_ | Select-Object -Last 1
    if ($res -and $res.PSObject.Properties["Completed"]) {
      $guiShown = $true
      $have = @($res.Installed)
      if ($res.Completed -and $res.Backend -and $res.Backend -ne "api" -and -not $res.LoggedIn) { Write-Host "Chua xac nhan dang nhap $($res.Backend): mo PowerShell, go lenh $($res.Backend) de dang nhap mot lan." -ForegroundColor Yellow }
      if (-not $res.Completed) { Write-Host "Ban chua hoan tat buoc chon cong cu AI. Chay lai bo cai dat de chon lai bat cu luc nao." -ForegroundColor Yellow }
    }
  } catch { Write-Host "Khong mo duoc cua so huong dan, chuyen sang ban dong lenh." -ForegroundColor Yellow }
}
if (-not $guiShown -and -not $choice -and ((-not $IsUpgrade) -or (-not $have)) -and [Environment]::UserInteractive) {
  $mark = { param($c) if ($have -contains $c) { "[da co]" } else { "[chua co]" } }
  Write-Host ""
  Write-Host "Cong cu AI cho PVTA (dung goi dang ky cua thay co; giao vien o Viet Nam thuong dung agy voi goi Gemini):"
  Write-Host ("  1 - {0,-24} {1}" -f "Antigravity (agy)", (& $mark "agy"))
  Write-Host ("  2 - {0,-24} {1}" -f "Claude Code (claude)", (& $mark "claude"))
  Write-Host ("  3 - {0,-24} {1}" -f "Codex (codex)", (& $mark "codex"))
  if ($have) { Write-Host "  0 - Giu nguyen, khong cai them" } else { Write-Host "  0 - Bo qua (cai sau, hoac dung khoa API trong Cai dat cua PVTA)" }
  $n = Read-Host "Chon mot so [0-3]"
  $choice = switch ($n) { "1" { "agy" } "2" { "claude" } "3" { "codex" } default { "none" } }
}
$cmd = $null
if ($choice -and $choice -ne "none" -and -not ($have -contains $choice)) {
  $cmd = switch ($choice) {
    "claude" { "irm https://claude.ai/install.ps1 | iex" }
    "codex"  { if (Get-Command npm -ErrorAction SilentlyContinue) { "npm install -g @openai/codex" } else { Write-Host "Codex can npm (Node.js). Cai Node.js tu nodejs.org roi chay: npm install -g @openai/codex" -ForegroundColor Yellow; $null } }
    "agy"    { "irm https://antigravity.google/cli/install.ps1 | iex" }
    default  { $null }
  }
}
if ($cmd) {
  Say "Cai ${choice}: $cmd"
  try {
    Invoke-Expression $cmd
    Write-Host "Da cai $choice." -ForegroundColor Green
    $have = @($have) + @($choice)
  } catch {
    Write-Host "Chua cai duoc $choice tu dong. Cai thu cong theo huong dan trong Cai dat cua PVTA, muc AI tren may." -ForegroundColor Yellow
  }
}
# Dang nhap mot lan (ban dong lenh; cua so huong dan da co buoc dang nhap rieng).
if (-not $guiShown -and $choice -and $choice -ne "none" -and ($have -contains $choice) -and [Environment]::UserInteractive) {
  # Lenh vua cai co the chua nam trong PATH cua cua so nay: doc lai PATH tu he thong.
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") + ";" + $env:Path
  $bin = Get-Command $choice -ErrorAction SilentlyContinue
  if ($bin) {
    Write-Host ""
    Write-Host "Dang nhap $choice ngay bay gio? Trinh duyet se mo de dang nhap; xong thi go /exit hoac bam Ctrl+C hai lan de quay lai day."
    $yn = Read-Host "Dang nhap ngay? [C/k]"
    if ($yn -match '^[kKnN]') { Write-Host "   De sau: mo PowerShell, go $choice de dang nhap mot lan." }
    else {
      try { if ($choice -eq "codex") { & $bin.Source login } else { & $bin.Source } } catch {}
      Write-Host "Xong buoc dang nhap $choice." -ForegroundColor Green
    }
  } else {
    Write-Host "   Mo cua so PowerShell moi, go $choice de dang nhap mot lan. Sau do thoat han Word roi mo lai." -ForegroundColor Yellow
  }
}
# Cong cu vua cai nam trong thu muc moi cua PATH: bridge dang chay con giu PATH cu, nen khoi dong lai de no thay.
if ($guiShown -or $cmd) {
  Stop-Bridge
  Start-Process wscript.exe -ArgumentList "`"$Startup`""
  for ($i = 0; $i -lt 20; $i++) {
    try { Invoke-WebRequest "https://localhost:52730/health" -UseBasicParsing | Out-Null; break } catch { Start-Sleep -Milliseconds 500 }
  }
}
Say "Da cai xong PVTA."
if (-not $have) { Write-Host "Chua thay claude, codex hoac agy tren may. Cai va dang nhap mot CLI (hoac nhap khoa API trong Cai dat cua PVTA) de PVTA tra loi duoc." -ForegroundColor Yellow }
Write-Host "   Mo lai Word / Excel / PowerPoint -> Insert -> Add-ins -> My Add-ins -> PVTA."
