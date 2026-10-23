Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object Windows.Forms.Form
$form.Text = 'PVTA - Thiet lap cong cu AI'; $form.Size = New-Object Drawing.Size(570,400); $form.StartPosition = 'CenterScreen'
$label = New-Object Windows.Forms.Label
$label.Text = 'Buoc 1: Chon cong cu AI. Da co cong cu thi chuyen sang dang nhap.'; $label.Location = New-Object Drawing.Point(25,25); $label.Size = New-Object Drawing.Size(510,40); $form.Controls.Add($label)
$choices = New-Object Windows.Forms.ComboBox
$choices.Location = New-Object Drawing.Point(25,80); $choices.Width = 490; $choices.DropDownStyle = 'DropDownList'
@('Gemini - agy (goi y cho giao vien Viet Nam)','Claude Code','OpenAI Codex','Dung khoa API trong Cai dat PVTA') | ForEach-Object { [void]$choices.Items.Add($_) }; $choices.SelectedIndex = 0; $form.Controls.Add($choices)
$status = New-Object Windows.Forms.Label
$status.Location = New-Object Drawing.Point(25,125); $status.Size = New-Object Drawing.Size(490,70); $form.Controls.Add($status)
$refresh = { $bins = @('agy','claude','codex'); $status.Text = ($bins | ForEach-Object { if (Get-Command $_ -ErrorAction SilentlyContinue) { "$_ : da cai" } else { "$_ : chua cai" } }) -join "`r`n" }; & $refresh
$install = New-Object Windows.Forms.Button; $install.Text = 'Buoc 2: Cai dat'; $install.Location = New-Object Drawing.Point(25,210); $install.Size = New-Object Drawing.Size(150,35)
$install.Add_Click({
 $commands = @('irm https://antigravity.google/cli/install.ps1 | iex','irm https://claude.ai/install.ps1 | iex','npm install -g @openai/codex')
 if ($choices.SelectedIndex -lt 3) { Start-Process powershell.exe -ArgumentList @('-NoExit','-Command',$commands[$choices.SelectedIndex]) }
}); $form.Controls.Add($install)
$login = New-Object Windows.Forms.Button; $login.Text = 'Buoc 3: Dang nhap'; $login.Location = New-Object Drawing.Point(190,210); $login.Size = New-Object Drawing.Size(150,35)
$login.Add_Click({$commands = @('agy','claude','codex login'); if ($choices.SelectedIndex -lt 3) { Start-Process powershell.exe -ArgumentList @('-NoExit','-Command',$commands[$choices.SelectedIndex]) }}); $form.Controls.Add($login)
$check = New-Object Windows.Forms.Button; $check.Text = 'Kiem tra lai'; $check.Location = New-Object Drawing.Point(355,210); $check.Size = New-Object Drawing.Size(150,35); $check.Add_Click($refresh); $form.Controls.Add($check)
$python = New-Object Windows.Forms.Button; $python.Text = 'Cai Python (ke toan, tai lieu)'; $python.Location = New-Object Drawing.Point(25,265); $python.Size = New-Object Drawing.Size(235,35)
$python.Add_Click({Start-Process powershell.exe -ArgumentList @('-NoExit','-Command','winget install --id Python.Python.3.13 -e; py -m pip install pypdf')}); $form.Controls.Add($python)
$done = New-Object Windows.Forms.Button; $done.Text = 'Hoan tat'; $done.Location = New-Object Drawing.Point(355,265); $done.Size = New-Object Drawing.Size(150,35); $done.Add_Click({$form.Close()}); $form.Controls.Add($done)
[void]$form.ShowDialog()
