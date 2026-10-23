# PVTA - cửa sổ hướng dẫn cài công cụ AI (Windows). Do install.ps1 gọi sau khi giải nén gói; không chạy riêng.
# Ba bước: 1) chọn công cụ AI  2) tự cài  3) đăng nhập. Chỉ dùng WinForms có sẵn trong Windows 10/11.
# Tệp này lưu UTF-8 có BOM để PowerShell 5.1 đọc đúng chữ tiếng Việt (không dùng dấu nháy cong trong chuỗi).
# Trả về: @{ Completed; Backend; Installed; LoggedIn } (hoặc $null nếu không mở được cửa sổ).
param(
  [string]$NodePath = "",
  [string]$AppDir = "",
  [string]$HomeDir = (Join-Path $env:USERPROFILE ".phananh-office")
)
# "Continue": lỗi nhỏ trong sự kiện của cửa sổ không được làm sập cửa sổ.
$ErrorActionPreference = "Continue"

if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne "STA") { return $null }
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
} catch { return $null }
[System.Windows.Forms.Application]::EnableVisualStyles()

# Để việc kiểm tra phản ánh đúng gói đăng ký, bỏ khóa API khỏi tiến trình cài này (không đụng biến của người dùng).
foreach ($v in "ANTHROPIC_API_KEY","ANTHROPIC_AUTH_TOKEN","GEMINI_API_KEY","GOOGLE_API_KEY","OPENAI_API_KEY","CODEX_API_KEY") {
  Remove-Item "Env:$v" -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------- Dữ liệu từng công cụ
$Violet = [System.Drawing.ColorTranslator]::FromHtml("#5a3e9e")
$VioletSoft = [System.Drawing.ColorTranslator]::FromHtml("#f1ecfa")
$Green = [System.Drawing.ColorTranslator]::FromHtml("#2e7d4f")
$Grey = [System.Drawing.ColorTranslator]::FromHtml("#5d6575")
$Red = [System.Drawing.ColorTranslator]::FromHtml("#b3261e")

$Tools = @(
  [pscustomobject]@{
    Id = "agy"; Name = "Gemini - Antigravity (agy)"; Short = "Antigravity"; Badge = "Gợi ý"
    Desc = "Đăng nhập bằng tài khoản Google. Có hạn mức miễn phí theo tuần; nên mua gói Google AI Pro để dùng thoải mái hơn (hạn mức làm mới mỗi 5 giờ)."
    Docs = "https://antigravity.google/docs/cli/install/"
    Steps = "1. Bấm Mở cửa sổ đăng nhập.`r`n2. Trình duyệt mở trang Google: chọn tài khoản (nên là tài khoản có gói Google AI Pro) rồi cho phép.`r`n3. Khi cửa sổ đen báo đăng nhập xong, đóng cửa sổ đen đó rồi bấm Kiểm tra đăng nhập."
  }
  [pscustomobject]@{
    Id = "claude"; Name = "Claude Code (claude)"; Short = "Claude Code"; Badge = ""
    Desc = "Cần gói Claude Pro, Max, Team hoặc Enterprise. Tài khoản Claude miễn phí không dùng được."
    Docs = "https://code.claude.com/docs/en/setup"
    Steps = "1. Bấm Mở cửa sổ đăng nhập.`r`n2. Trong cửa sổ đen, làm theo hướng dẫn (chọn giao diện, bấm Enter). Khi được hỏi cách đăng nhập, chọn tài khoản Claude có gói đăng ký; trình duyệt sẽ mở để đồng ý.`r`n3. Thấy báo đăng nhập thành công thì đóng cửa sổ đen, rồi bấm Kiểm tra đăng nhập."
  }
  [pscustomobject]@{
    Id = "codex"; Name = "Codex (codex)"; Short = "Codex"; Badge = ""
    Desc = "Đăng nhập bằng tài khoản ChatGPT. Gói Free dùng được nhưng hạn mức thấp; gói Plus, Pro hoặc Business có hạn mức cao hơn."
    Docs = "https://developers.openai.com/codex/cli"
    Steps = "1. Bấm Mở cửa sổ đăng nhập (chạy lệnh codex login).`r`n2. Trình duyệt mở trang ChatGPT: đăng nhập và cho phép.`r`n3. Xong thì đóng cửa sổ đen, rồi bấm Kiểm tra đăng nhập. Nếu trình duyệt không mở được, bấm Đăng nhập bằng mã."
  }
  [pscustomobject]@{
    Id = "api"; Name = "Khóa API (không cần cài gì)"; Short = "Khóa API"; Badge = ""
    Desc = "Trả tiền theo lượt dùng, không cần gói đăng ký. Dùng khi chưa có gói nào ở trên."
    Docs = ""
    Steps = ""
  }
)
function Get-Tool([string]$id) { $Tools | Where-Object { $_.Id -eq $id } | Select-Object -First 1 }

# ---------------------------------------------------------------- Tìm và kiểm tra công cụ
function Update-SessionPath {
  $m = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $u = [Environment]::GetEnvironmentVariable("Path", "User")
  $extra = @((Join-Path $env:LOCALAPPDATA "agy\bin"), (Join-Path $env:USERPROFILE ".local\bin"), (Join-Path $env:APPDATA "npm"))
  $env:Path = (@($u, $m, $env:Path) + $extra | Where-Object { $_ }) -join ";"
}

function Get-ToolPath([string]$id) {
  if ($id -eq "api") { return $null }
  Update-SessionPath
  $cmd = Get-Command $id -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  $known = switch ($id) {
    "agy" { Join-Path $env:LOCALAPPDATA "agy\bin\agy.exe" }
    "claude" { Join-Path $env:USERPROFILE ".local\bin\claude.exe" }
    "codex" { Join-Path $env:APPDATA "npm\codex.cmd" }
  }
  if ($known -and (Test-Path $known)) { return $known }
  return $null
}

# Dấu hiệu đã đăng nhập (đọc tệp, không tốn lượt dùng). $null = không biết (agy lưu trong Credential Manager).
function Test-LoginFiles([string]$id) {
  switch ($id) {
    "claude" {
      $dir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".claude" }
      if (Test-Path (Join-Path $dir ".credentials.json")) { return $true }
      $j = Join-Path $env:USERPROFILE ".claude.json"
      if (Test-Path $j) { try { return ((Get-Content $j -Raw) -match '"oauthAccount"') } catch { return $false } }
      return $false
    }
    "codex" {
      $dir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
      return (Test-Path (Join-Path $dir "auth.json"))
    }
    default { return $null }
  }
}

# ---------------------------------------------------------------- Tiến trình nền (không làm đơ cửa sổ)
function Start-Hidden([string]$file, [string[]]$argList, [string]$log) {
  $p = Start-Process -FilePath $file -ArgumentList $argList -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $log -RedirectStandardError ($log + ".err") -WorkingDirectory $env:TEMP
  $null = $p.Handle   # giữ tay cầm để đọc được ExitCode
  return $p
}

function Get-LastLine([string]$log) {
  foreach ($f in @(($log + ".err"), $log)) {
    if (Test-Path $f) {
      try {
        $line = Get-Content $f -Tail 20 -ErrorAction Stop | Where-Object { $_ -and $_.Trim() } | Select-Object -Last 1
        if ($line) { $t = ($line -replace "\x1B\[[0-9;?]*[A-Za-z]", "").Trim(); if ($t.Length -gt 110) { $t = $t.Substring(0, 110) }; return $t }
      } catch {}
    }
  }
  return ""
}

function New-InstallScript([string]$id) {
  $f = Join-Path $env:TEMP ("pvta-cai-" + $id + ".ps1")
  $lines = @('[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12', '$ErrorActionPreference = "Stop"')
  switch ($id) {
    "agy"    { $lines += 'irm https://antigravity.google/cli/install.ps1 | iex' }
    "claude" { $lines += 'irm https://claude.ai/install.ps1 | iex' }
    "codex" {
      $nodeDir = if ($NodePath) { Split-Path $NodePath } else { "" }
      $npm = if ($nodeDir -and (Test-Path (Join-Path $nodeDir "npm.cmd"))) { Join-Path $nodeDir "npm.cmd" } else { "npm.cmd" }
      $lines += ('$env:Path = "' + $nodeDir + ';" + $env:Path')
      $lines += '$prefix = Join-Path $env:APPDATA "npm"'
      $lines += ('& "' + $npm + '" install -g @openai/codex --prefix $prefix')
      $lines += 'if ($LASTEXITCODE -ne 0) { throw "npm install that bai" }'
      $lines += '$u = [Environment]::GetEnvironmentVariable("Path", "User")'
      $lines += 'if (-not ($u -split ";" | Where-Object { $_ -eq $prefix })) { [Environment]::SetEnvironmentVariable("Path", (($u, $prefix | Where-Object { $_ }) -join ";"), "User") }'
    }
  }
  Set-Content -Path $f -Value $lines -Encoding ASCII
  return $f
}

function Start-Install([string]$id) {
  $script = New-InstallScript $id
  $log = Join-Path $env:TEMP ("pvta-cai-" + $id + ".log")
  Remove-Item $log, ($log + ".err") -ErrorAction SilentlyContinue
  $p = Start-Hidden "powershell.exe" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $script + '"')) $log
  $script:Job = @{ Kind = "install"; Proc = $p; Id = $id; Log = $log; Started = Get-Date }
}

function Start-Check([string]$id, [string]$path) {
  $log = Join-Path $env:TEMP ("pvta-kiemtra-" + $id + ".log")
  Remove-Item $log, ($log + ".err") -ErrorAction SilentlyContinue
  $a = switch ($id) {
    "agy"    { @("-p", "OK", "--print-timeout", "45s") }
    "claude" { @("-p", "OK") }
    "codex"  { @("exec", "--skip-git-repo-check", "--sandbox", "read-only", "OK") }
  }
  $p = Start-Hidden $path $a $log
  $script:Job = @{ Kind = "check"; Proc = $p; Id = $id; Log = $log; Started = Get-Date }
}

function Stop-BackgroundJob {
  if ($script:Job -and $script:Job.Proc -and -not $script:Job.Proc.HasExited) {
    try { & taskkill.exe /PID $script:Job.Proc.Id /T /F 2>&1 | Out-Null } catch {}
  }
  $script:Job = $null
}

function Open-Login([string]$id, [bool]$device = $false) {
  $q = $script:ToolPath.Replace("'", "''")
  $cmd = switch ($id) {
    "codex" { if ($device) { "& '$q' login --device-auth" } else { "& '$q' login" } }
    default { "& '$q'" }
  }
  Start-Process -FilePath "powershell.exe" -WorkingDirectory $env:USERPROFILE `
    -ArgumentList @("-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ('"' + $cmd + '"'))
}

# ---------------------------------------------------------------- Trạng thái
$script:Job = $null
$script:ToolPath = $null
$script:Chosen = $null
$script:Page = 1
$script:LoggedIn = $false
$script:Completed = $false
$script:Radios = @{}
$script:RowPanels = @{}
$script:StatusLabels = @{}

# ---------------------------------------------------------------- Cửa sổ
$font = New-Object System.Drawing.Font("Segoe UI", 10)
$fontBold = New-Object System.Drawing.Font("Segoe UI Semibold", 10.5)
$fontSmall = New-Object System.Drawing.Font("Segoe UI", 9)

function New-Label([string]$text, [int]$x, [int]$y, [int]$w, [int]$h, $f = $font, $color = $null) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text; $l.Location = New-Object System.Drawing.Point($x, $y); $l.Size = New-Object System.Drawing.Size($w, $h)
  $l.Font = $f; $l.AutoSize = $false
  if ($color) { $l.ForeColor = $color }
  return $l
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Cài đặt PVTA"
$form.ClientSize = New-Object System.Drawing.Size(640, 610)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [System.Drawing.Color]::White
$form.Font = $font

$iconFile = if ($AppDir) { Join-Path $AppDir "web\icon-64.png" } else { "" }
$logo = $null
if ($iconFile -and (Test-Path $iconFile)) {
  try {
    $logo = New-Object System.Drawing.Bitmap($iconFile)
    $form.Icon = [System.Drawing.Icon]::FromHandle($logo.GetHicon())
  } catch { $logo = $null }
}

# Đầu cửa sổ
$header = New-Object System.Windows.Forms.Panel
$header.Dock = "Top"; $header.Height = 78; $header.BackColor = $Violet
if ($logo) {
  $pic = New-Object System.Windows.Forms.PictureBox
  $pic.Image = $logo; $pic.SizeMode = "Zoom"
  $pic.Location = New-Object System.Drawing.Point(18, 11); $pic.Size = New-Object System.Drawing.Size(56, 56)
  $pic.BackColor = [System.Drawing.Color]::Transparent
  $header.Controls.Add($pic)
}
$hx = if ($logo) { 86 } else { 20 }
$lblTitle = New-Label "Cài đặt PVTA" $hx 11 520 30 (New-Object System.Drawing.Font("Segoe UI Semibold", 16)) ([System.Drawing.Color]::White)
$lblSub = New-Label "" $hx 44 520 24 $font ([System.Drawing.Color]::FromArgb(230, 222, 248))
$header.Controls.AddRange(@($lblTitle, $lblSub))

# Chân cửa sổ (nút)
$footer = New-Object System.Windows.Forms.Panel
$footer.Dock = "Bottom"; $footer.Height = 64; $footer.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#f7f8fa")
$btnNext = New-Object System.Windows.Forms.Button
$btnNext.Size = New-Object System.Drawing.Size(150, 38); $btnNext.Location = New-Object System.Drawing.Point(474, 13)
$btnNext.Text = "Tiếp tục"; $btnNext.FlatStyle = "Flat"; $btnNext.BackColor = $Violet; $btnNext.ForeColor = [System.Drawing.Color]::White
$btnNext.FlatAppearance.BorderSize = 0; $btnNext.Font = $fontBold
$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Size = New-Object System.Drawing.Size(110, 38); $btnCancel.Location = New-Object System.Drawing.Point(352, 13)
$btnCancel.Text = "Thoát"; $btnCancel.FlatStyle = "Flat"
$lblFoot = New-Label "" 16 8 330 48 $fontSmall $Grey
$footer.Controls.AddRange(@($lblFoot, $btnCancel, $btnNext))

# Phần giữa: ba trang
$content = New-Object System.Windows.Forms.Panel
$content.Dock = "Fill"
$pageChoose = New-Object System.Windows.Forms.Panel; $pageChoose.Dock = "Fill"
$pageInstall = New-Object System.Windows.Forms.Panel; $pageInstall.Dock = "Fill"
$pageLogin = New-Object System.Windows.Forms.Panel; $pageLogin.Dock = "Fill"
$content.Controls.AddRange(@($pageChoose, $pageInstall, $pageLogin))
$form.Controls.AddRange(@($content, $footer, $header))

# ---- Trang 1: chọn công cụ
$intro = New-Label "PVTA cần một công cụ AI chạy bằng gói đăng ký của thầy/cô. Ứng dụng chat như ChatGPT hay Claude (trên web hoặc app) không dùng trực tiếp được, vì PVTA không điều khiển được chúng; PVTA dùng bản dòng lệnh của cùng hãng, đăng nhập bằng cùng tài khoản đó." 20 12 600 66 $font $Grey
$pageChoose.Controls.Add($intro)

$onChecked = {
  foreach ($k in $script:Radios.Keys) {
    $script:RowPanels[$k].BackColor = if ($script:Radios[$k].Checked) { $VioletSoft } else { [System.Drawing.Color]::White }
  }
  if ($script:Page -eq 1) { Update-NextLabel }
}
$rowY = 84
foreach ($t in $Tools) {
  $row = New-Object System.Windows.Forms.Panel
  $row.Location = New-Object System.Drawing.Point(20, $rowY); $row.Size = New-Object System.Drawing.Size(600, 96)
  $row.BorderStyle = "FixedSingle"; $row.BackColor = [System.Drawing.Color]::White; $row.Cursor = "Hand"
  $rb = New-Object System.Windows.Forms.RadioButton
  $rb.Text = $t.Name; $rb.Font = $fontBold; $rb.Location = New-Object System.Drawing.Point(12, 8); $rb.Size = New-Object System.Drawing.Size(440, 26)
  $rb.Tag = $t.Id
  $desc = New-Label $t.Desc 34 36 552 38 $fontSmall ([System.Drawing.ColorTranslator]::FromHtml("#1d2330"))
  $st = New-Label "" 34 74 552 18 $fontSmall $Grey
  $row.Controls.AddRange(@($rb, $desc, $st))
  if ($t.Badge) {
    $b = New-Label $t.Badge 520 10 64 22 $fontSmall $Violet
    $b.BackColor = $VioletSoft; $b.TextAlign = "MiddleCenter"
    $row.Controls.Add($b); $b.BringToFront()
  }
  $r = $rb
  $select = { $r.Checked = $true }.GetNewClosure()
  $row.Add_Click($select); $desc.Add_Click($select); $st.Add_Click($select)
  $rb.Add_CheckedChanged($onChecked)
  $script:Radios[$t.Id] = $rb; $script:RowPanels[$t.Id] = $row; $script:StatusLabels[$t.Id] = $st
  $pageChoose.Controls.Add($row)
  $rowY += 104
}

# ---- Trang 2: đang cài
$lblInstallTitle = New-Label "" 20 30 600 28 (New-Object System.Drawing.Font("Segoe UI Semibold", 13))
$lblInstallInfo = New-Label "" 20 66 600 44 $font $Grey
$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Style = "Marquee"; $bar.MarqueeAnimationSpeed = 30
$bar.Location = New-Object System.Drawing.Point(20, 124); $bar.Size = New-Object System.Drawing.Size(600, 14)
$lblInstallLog = New-Label "" 20 148 600 36 $fontSmall $Grey
$lblInstallErr = New-Label "" 20 196 600 70 $font $Red
$btnRetry = New-Object System.Windows.Forms.Button
$btnRetry.Text = "Thử lại"; $btnRetry.Size = New-Object System.Drawing.Size(100, 34); $btnRetry.Location = New-Object System.Drawing.Point(20, 276); $btnRetry.Visible = $false
$btnManual = New-Object System.Windows.Forms.Button
$btnManual.Text = "Xem cách cài thủ công"; $btnManual.Size = New-Object System.Drawing.Size(190, 34); $btnManual.Location = New-Object System.Drawing.Point(130, 276); $btnManual.Visible = $false
$pageInstall.Controls.AddRange(@($lblInstallTitle, $lblInstallInfo, $bar, $lblInstallLog, $lblInstallErr, $btnRetry, $btnManual))

# ---- Trang 3: đăng nhập
$lblLoginTitle = New-Label "" 20 14 600 28 (New-Object System.Drawing.Font("Segoe UI Semibold", 13))
$lblLoginSteps = New-Label "" 20 52 600 128 $font ([System.Drawing.ColorTranslator]::FromHtml("#1d2330"))
$btnLogin = New-Object System.Windows.Forms.Button
$btnLogin.Text = "Mở cửa sổ đăng nhập"; $btnLogin.Size = New-Object System.Drawing.Size(210, 38); $btnLogin.Location = New-Object System.Drawing.Point(20, 190)
$btnLogin.FlatStyle = "Flat"; $btnLogin.BackColor = $VioletSoft; $btnLogin.ForeColor = $Violet; $btnLogin.Font = $fontBold
$btnDevice = New-Object System.Windows.Forms.Button
$btnDevice.Text = "Đăng nhập bằng mã"; $btnDevice.Size = New-Object System.Drawing.Size(170, 38); $btnDevice.Location = New-Object System.Drawing.Point(240, 190); $btnDevice.Visible = $false
$btnCheck = New-Object System.Windows.Forms.Button
$btnCheck.Text = "Kiểm tra đăng nhập"; $btnCheck.Size = New-Object System.Drawing.Size(190, 38); $btnCheck.Location = New-Object System.Drawing.Point(20, 240)
$lblLoginState = New-Label "" 220 246 400 44 $font $Grey
$lblLoginNote = New-Label "" 20 304 600 70 $fontSmall $Grey
$pageLogin.Controls.AddRange(@($lblLoginTitle, $lblLoginSteps, $btnLogin, $btnDevice, $btnCheck, $lblLoginState, $lblLoginNote))

# ---------------------------------------------------------------- Chuyển trang
function Update-NextLabel {
  $id = ($script:Radios.Keys | Where-Object { $script:Radios[$_].Checked } | Select-Object -First 1)
  if (-not $id) { $btnNext.Enabled = $false; return }
  $btnNext.Enabled = $true
  $script:Chosen = $id
  $btnNext.Text = "Tiếp tục"
}

function Show-Page([int]$n) {
  $script:Page = $n
  $pageChoose.Visible = ($n -eq 1); $pageInstall.Visible = ($n -eq 2); $pageLogin.Visible = ($n -eq 3)
  switch ($n) {
    1 { $lblSub.Text = "Bước 1/3: chọn công cụ AI"; $btnCancel.Visible = $true; $btnNext.Visible = $true; $lblFoot.Text = "Có thể thêm hoặc đổi công cụ khác sau trong PVTA, mục Cài đặt."; Update-NextLabel }
    2 { $lblSub.Text = "Bước 2/3: cài đặt"; $btnCancel.Visible = $true; $btnNext.Visible = $false; $lblFoot.Text = "" }
    3 { $lblSub.Text = "Bước 3/3: đăng nhập"; $btnCancel.Visible = $false; $btnNext.Visible = $true; $btnNext.Text = "Tiếp tục"; $btnNext.Enabled = $true; $lblFoot.Text = "" }
  }
}

function Refresh-Status {
  foreach ($t in $Tools) {
    $lbl = $script:StatusLabels[$t.Id]
    if ($t.Id -eq "api") { $lbl.Text = "Không cần cài. Nhập khóa trong PVTA, mục Cài đặt."; $lbl.ForeColor = $Grey; continue }
    $p = Get-ToolPath $t.Id
    if ($p) {
      $li = Test-LoginFiles $t.Id
      if ($li -eq $true) { $lbl.Text = "Đã cài trên máy, đã thấy đăng nhập" } else { $lbl.Text = "Đã cài trên máy" }
      $lbl.ForeColor = $Green
    } else { $lbl.Text = "Chưa cài. PVTA sẽ tự cài giúp ở bước sau."; $lbl.ForeColor = $Grey }
  }
}

function Enter-Login {
  $t = Get-Tool $script:Chosen
  Show-Page 3
  if ($t.Id -eq "api") {
    $lblLoginTitle.Text = "Dùng khóa API"
    $lblLoginSteps.Text = "1. Bấm Tiếp tục để kết thúc cài đặt.`r`n2. Mở Word, Excel hoặc PowerPoint, vào PVTA, mở Cài đặt, mục Khóa API, rồi bấm Thêm khóa API.`r`n3. Dán khóa API của Anthropic, OpenAI hoặc Google. Khóa được lưu trên máy này."
    $btnLogin.Visible = $false; $btnDevice.Visible = $false; $btnCheck.Visible = $false
    $lblLoginState.Text = ""; $lblLoginNote.Text = "Lưu ý: dùng khóa API sẽ tính tiền theo lượt dùng ở nhà cung cấp."
    return
  }
  $btnLogin.Visible = $true; $btnCheck.Visible = $true; $btnDevice.Visible = ($t.Id -eq "codex")
  $lblLoginTitle.Text = "Đăng nhập " + $t.Short
  $lblLoginSteps.Text = $t.Steps
  $script:LoggedIn = $false
  $li = Test-LoginFiles $t.Id
  if ($li -eq $true) { $script:LoggedIn = $true; $lblLoginState.Text = "Đã thấy đăng nhập trên máy này."; $lblLoginState.ForeColor = $Green }
  elseif ($t.Id -eq "agy") { $lblLoginState.Text = "Chưa kiểm tra. Đăng nhập xong thì bấm Kiểm tra đăng nhập."; $lblLoginState.ForeColor = $Grey }
  else { $lblLoginState.Text = "Chưa thấy đăng nhập."; $lblLoginState.ForeColor = $Grey }
  $lblLoginNote.Text = "Chưa đăng nhập vẫn bấm Tiếp tục được. Về sau, mở PowerShell và gõ lệnh " + $t.Id + " để đăng nhập."
  $btnCheck.Enabled = $true
}

function Enter-Install {
  $t = Get-Tool $script:Chosen
  if ($t.Id -eq "api") { Enter-Login; return }
  $script:ToolPath = Get-ToolPath $t.Id
  if ($script:ToolPath) { Enter-Login; return }   # đã có sẵn: bỏ qua bước cài
  Show-Page 2
  $lblInstallTitle.Text = "Đang cài " + $t.Short
  $lblInstallInfo.Text = "Mất khoảng 1 đến 2 phút. Xin đừng tắt cửa sổ này. Nếu Windows hỏi xác nhận, hãy chọn Yes."
  $lblInstallLog.Text = ""; $lblInstallErr.Text = ""
  $btnRetry.Visible = $false; $btnManual.Visible = $false; $bar.Visible = $true
  Start-Install $t.Id
}

# ---------------------------------------------------------------- Sự kiện
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 700
$timer.Add_Tick({
  $j = $script:Job
  if ($script:Page -eq 3 -and -not $j -and $script:Chosen -and $script:Chosen -ne "api" -and -not $script:LoggedIn) {
    # Tự nhận ra khi người dùng vừa đăng nhập xong (claude, codex).
    if ((Test-LoginFiles $script:Chosen) -eq $true) {
      $script:LoggedIn = $true; $lblLoginState.Text = "Đã thấy đăng nhập trên máy này."; $lblLoginState.ForeColor = $Green
    }
  }
  if (-not $j) { return }
  $elapsed = ((Get-Date) - $j.Started).TotalSeconds
  if ($j.Kind -eq "install") {
    $last = Get-LastLine $j.Log
    if ($last) { $lblInstallLog.Text = $last }
    if ($j.Proc.HasExited) {
      $script:Job = $null
      $script:ToolPath = Get-ToolPath $j.Id
      if ($script:ToolPath) { Enter-Login }
      else {
        $bar.Visible = $false
        $lblInstallTitle.Text = "Chưa cài được " + (Get-Tool $j.Id).Short
        $lblInstallErr.Text = "Cài đặt chưa thành công" + $(if ($last) { ": " + $last } else { "." }) + " Kiểm tra mạng rồi bấm Thử lại, hoặc cài thủ công theo hướng dẫn."
        $btnRetry.Visible = $true; $btnManual.Visible = $true
        $btnNext.Visible = $true; $btnNext.Text = "Bỏ qua"
      }
    } elseif ($elapsed -gt 420) { Stop-BackgroundJob; $lblInstallErr.Text = "Quá lâu chưa xong. Bấm Thử lại hoặc cài thủ công."; $btnRetry.Visible = $true; $btnManual.Visible = $true; $bar.Visible = $false }
  } elseif ($j.Kind -eq "check") {
    if ($j.Proc.HasExited -or $elapsed -gt 75) {
      $ok = $j.Proc.HasExited -and ($j.Proc.ExitCode -eq 0)
      $last = Get-LastLine $j.Log
      if (-not $j.Proc.HasExited) { Stop-BackgroundJob } else { $script:Job = $null }
      $btnCheck.Enabled = $true; $btnLogin.Enabled = $true
      if ($ok) { $script:LoggedIn = $true; $lblLoginState.Text = "Đăng nhập tốt: công cụ đã trả lời được."; $lblLoginState.ForeColor = $Green }
      else { $lblLoginState.Text = "Chưa được" + $(if ($last) { ": " + $last } else { " (chưa đăng nhập hoặc quá thời gian)." }); $lblLoginState.ForeColor = $Red }
    }
  }
})
$timer.Start()

$btnLogin.Add_Click({ if ($script:ToolPath) { Open-Login $script:Chosen $false } })
$btnDevice.Add_Click({ if ($script:ToolPath) { Open-Login $script:Chosen $true } })
$btnCheck.Add_Click({
  if (-not $script:ToolPath -or $script:Job) { return }
  if ((Test-LoginFiles $script:Chosen) -eq $true) { $script:LoggedIn = $true; $lblLoginState.Text = "Đã thấy đăng nhập trên máy này."; $lblLoginState.ForeColor = $Green; return }
  $btnCheck.Enabled = $false
  $lblLoginState.Text = "Đang kiểm tra (tối đa 1 phút, dùng một lượt hỏi rất nhỏ)..."; $lblLoginState.ForeColor = $Grey
  Start-Check $script:Chosen $script:ToolPath
})
$btnRetry.Add_Click({ Stop-BackgroundJob; $btnNext.Visible = $false; Enter-Install })
$btnManual.Add_Click({ $d = (Get-Tool $script:Chosen).Docs; if ($d) { Start-Process $d } })
$btnCancel.Add_Click({ $form.Close() })
$btnNext.Add_Click({
  switch ($script:Page) {
    1 { Enter-Install }
    2 { $form.Close() }   # nút Bỏ qua khi cài lỗi: thoát, lần sau sẽ hỏi lại
    3 { $script:Completed = $true; $form.Close() }
  }
})
$form.Add_FormClosing({ $timer.Stop(); Stop-BackgroundJob })
$form.Add_Shown({ $form.Activate(); $form.TopMost = $true; $form.TopMost = $false })

# ---------------------------------------------------------------- Khởi động
Refresh-Status
$first = ("agy", "claude", "codex" | Where-Object { Get-ToolPath $_ } | Select-Object -First 1)
if (-not $first) { $first = "agy" }
$script:Radios[$first].Checked = $true
Show-Page 1
[void]$form.ShowDialog()

$have = @("agy", "claude", "codex" | Where-Object { Get-ToolPath $_ })
if ($script:Completed -and $script:Chosen) {
  try {
    New-Item -ItemType Directory -Force $HomeDir | Out-Null
    (@{ completed = $true; backend = $script:Chosen; loggedIn = $script:LoggedIn; at = (Get-Date).ToString("s") } | ConvertTo-Json) |
      Set-Content -Path (Join-Path $HomeDir "setup.json") -Encoding UTF8
  } catch {}
}
return [pscustomobject]@{ Completed = $script:Completed; Backend = $script:Chosen; Installed = $have; LoggedIn = $script:LoggedIn }
