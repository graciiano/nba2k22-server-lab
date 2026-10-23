# Launcher do servidor NBA 2K22 (host e amigos).
# Ideia tirada do launcher "BestServers" (game22.js): toda cópia SteamRIP/Goldberg sai com o mesmo ID Steam falso
# (76561198372507462 "Player"), então o servidor veria todos os jogadores como a mesma conta. Aqui cada PC recebe
# um ID próprio (gerado uma vez e guardado), gravado no emulador Goldberg antes de abrir o jogo:
#   <jogo>\data\steam\steam_settings\settings\user_steam_id.txt e account_name.txt (cópia .launcher.bak antes)
#   <jogo>\data\steam\disable_lan_only.txt (o Goldberg "só LAN" desvia todo endereço que não é da rede local)
# O jogo continua sendo aberto pelo nosso redirect\Start-Capture.ps1 (redirecionamento + módulos).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$Root = Split-Path $PSScriptRoot -Parent
$StateDir = Join-Path $env:APPDATA 'NBA2K22-Server'
$StateFile = Join-Path $StateDir 'launcher.json'
$DefaultGame = 'C:\Users\Diogo\Downloads\nba 2k22\NBA 2K22'
$SharedId = '76561198372507462'   # ID que vem em toda cópia SteamRIP

function Load-State {
  $s = @{ gameDir = ''; role = 'host'; hostIp = ''; name = ''; steamId = '' }
  if (Test-Path -LiteralPath $StateFile) {
    try { $j = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json; foreach ($k in @($s.Keys)) { if ($j.$k) { $s[$k] = [string]$j.$k } } } catch { }
  }
  if (-not $s.gameDir -and (Test-Path -LiteralPath (Join-Path $DefaultGame 'NBA2K22.exe'))) { $s.gameDir = $DefaultGame }
  return $s
}
function Save-State($s) {
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  ($s | ConvertTo-Json) | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

# --- Goldberg (cópia SteamRIP) ---
function Goldberg-Dir($game) {
  foreach ($d in @((Join-Path $game 'data\steam'), $game)) { if (Test-Path -LiteralPath (Join-Path $d 'steam_settings')) { return $d } }
  return $null
}
function Goldberg-Settings($game) {
  $d = Goldberg-Dir $game; if (-not $d) { return $null }
  $save = ''; $f = Join-Path $d 'local_save.txt'
  if (Test-Path -LiteralPath $f) { $save = (Get-Content -LiteralPath $f -Raw).Trim() }
  if ($save -and $save -notmatch '[:\\/]' -and $save -notmatch '\.\.') { return Join-Path (Join-Path $d $save) 'settings' }
  return Join-Path $env:APPDATA 'Goldberg SteamEmu Saves\settings'
}
function Read-Text($f) { if (Test-Path -LiteralPath $f) { return (Get-Content -LiteralPath $f -Raw).Trim() } return '' }
function Goldberg-Identity($game) {
  $dir = Goldberg-Settings $game; if (-not $dir) { return $null }
  return @{ id = (Read-Text (Join-Path $dir 'user_steam_id.txt')); name = (Read-Text (Join-Path $dir 'account_name.txt')) }
}
function Write-Goldberg($game, $id, $name) {
  $dir = Goldberg-Settings $game
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  foreach ($pair in @(@('user_steam_id.txt', $id), @('account_name.txt', $name))) {
    $f = Join-Path $dir $pair[0]
    if ((Test-Path -LiteralPath $f) -and -not (Test-Path -LiteralPath "$f.launcher.bak")) { Copy-Item -LiteralPath $f -Destination "$f.launcher.bak" }
    [IO.File]::WriteAllText($f, [string]$pair[1])
  }
  $lan = Join-Path (Goldberg-Dir $game) 'disable_lan_only.txt'
  if (-not (Test-Path -LiteralPath $lan)) { [IO.File]::WriteAllText($lan, '') }
}
# ID Steam 64 válido e único por PC: 7656119 + 10 dígitos aleatórios (nunca o ID compartilhado da cópia).
function New-SteamId {
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $b = New-Object byte[] 8
  do { $rng.GetBytes($b); $n = [BitConverter]::ToUInt64($b, 0) % 9000000000 + 1000000000; $id = "7656119$n" } while ($id -eq $SharedId)
  return $id
}
function Clean-Name($n) { $n = ($n -replace '[^\w .-]', '').Trim(); if ($n.Length -gt 16) { $n = $n.Substring(0, 16) }; return $n }

function Test-Port($port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $c.Connect('127.0.0.1', $port); return $true } catch { return $false } finally { $c.Dispose() }
}

# --- Janela ---
$state = Load-State
$form = New-Object Windows.Forms.Form
$form.Text = 'NBA 2K22 Server - Launcher'; $form.Size = New-Object Drawing.Size(560, 470); $form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false
$y = 15
function Add-Label($text, $x, $yy, $w = 520) { $l = New-Object Windows.Forms.Label; $l.Text = $text; $l.Location = New-Object Drawing.Point($x, $yy); $l.Size = New-Object Drawing.Size($w, 20); $form.Controls.Add($l); return $l }

Add-Label 'Pasta do jogo (a que tem NBA2K22.exe):' 15 $y | Out-Null; $y += 22
$gameBox = New-Object Windows.Forms.TextBox; $gameBox.Location = New-Object Drawing.Point(15, $y); $gameBox.Size = New-Object Drawing.Size(420, 22); $gameBox.Text = $state.gameDir; $form.Controls.Add($gameBox)
$browse = New-Object Windows.Forms.Button; $browse.Text = 'Escolher...'; $browse.Location = New-Object Drawing.Point(445, ($y - 1)); $browse.Size = New-Object Drawing.Size(90, 24); $form.Controls.Add($browse)
$y += 35

$hostRadio = New-Object Windows.Forms.RadioButton; $hostRadio.Text = 'Sou o HOST (o servidor roda neste PC)'; $hostRadio.Location = New-Object Drawing.Point(15, $y); $hostRadio.Size = New-Object Drawing.Size(520, 22); $form.Controls.Add($hostRadio); $y += 24
$friendRadio = New-Object Windows.Forms.RadioButton; $friendRadio.Text = 'Sou AMIGO (vou jogar no servidor de outra pessoa)'; $friendRadio.Location = New-Object Drawing.Point(15, $y); $friendRadio.Size = New-Object Drawing.Size(520, 22); $form.Controls.Add($friendRadio); $y += 28
if ($state.role -eq 'friend') { $friendRadio.Checked = $true } else { $hostRadio.Checked = $true }

Add-Label 'IP do host (Radmin VPN / ZeroTier / Tailscale / rede local):' 15 $y | Out-Null; $y += 22
$ipBox = New-Object Windows.Forms.TextBox; $ipBox.Location = New-Object Drawing.Point(15, $y); $ipBox.Size = New-Object Drawing.Size(200, 22); $ipBox.Text = $state.hostIp; $form.Controls.Add($ipBox); $y += 35

Add-Label 'Seu nome no jogo:' 15 $y | Out-Null; $y += 22
$nameBox = New-Object Windows.Forms.TextBox; $nameBox.Location = New-Object Drawing.Point(15, $y); $nameBox.Size = New-Object Drawing.Size(200, 22); $nameBox.MaxLength = 16; $form.Controls.Add($nameBox); $y += 32
$idLabel = Add-Label '' 15 $y; $y += 22
$keepShared = New-Object Windows.Forms.CheckBox; $keepShared.Text = 'Host: manter o ID atual da cópia (sua conta, inventário e loja grátis continuam iguais)'; $keepShared.Location = New-Object Drawing.Point(15, $y); $keepShared.Size = New-Object Drawing.Size(520, 22); $keepShared.Checked = $true; $form.Controls.Add($keepShared); $y += 34

$play = New-Object Windows.Forms.Button; $play.Text = 'JOGAR'; $play.Location = New-Object Drawing.Point(15, $y); $play.Size = New-Object Drawing.Size(520, 44)
$play.Font = New-Object Drawing.Font('Segoe UI', 13, [Drawing.FontStyle]::Bold); $form.Controls.Add($play); $y += 54
$status = New-Object Windows.Forms.Label; $status.Location = New-Object Drawing.Point(15, $y); $status.Size = New-Object Drawing.Size(520, 60); $form.Controls.Add($status)

function Refresh-Ui {
  $friend = $friendRadio.Checked
  $ipBox.Enabled = $friend; $keepShared.Visible = -not $friend
  $cur = if ($gameBox.Text -and (Test-Path -LiteralPath (Join-Path $gameBox.Text 'NBA2K22.exe'))) { Goldberg-Identity $gameBox.Text } else { $null }
  if (-not $nameBox.Text) { $nameBox.Text = if ($state.name) { $state.name } elseif ($cur -and $cur.name) { $cur.name } else { 'Player' } }
  if ($cur -eq $null) { $idLabel.Text = 'Cópia sem emulador Goldberg (Steam original): o ID é o da sua conta Steam.' }
  else { $idLabel.Text = "ID Steam atual da cópia: $($cur.id)" + $(if ($cur.id -eq $SharedId) { '  (o ID compartilhado da SteamRIP)' } else { '' }) }
}
$hostRadio.Add_CheckedChanged({ Refresh-Ui }); $friendRadio.Add_CheckedChanged({ Refresh-Ui })
$browse.Add_Click({
  $dlg = New-Object Windows.Forms.FolderBrowserDialog; $dlg.Description = 'Escolha a pasta do NBA 2K22 (a que tem NBA2K22.exe)'
  if ($dlg.ShowDialog() -eq 'OK') { $gameBox.Text = $dlg.SelectedPath; Refresh-Ui }
})

$play.Add_Click({
  try {
    $play.Enabled = $false; $status.Text = 'Preparando...'; $form.Refresh()
    $game = $gameBox.Text.Trim()
    if (-not (Test-Path -LiteralPath (Join-Path $game 'NBA2K22.exe'))) { throw 'Essa pasta não tem NBA2K22.exe. Escolha a pasta do jogo.' }
    if (Get-Process NBA2K22 -ErrorAction SilentlyContinue) { throw 'O NBA 2K22 já está aberto. Feche-o antes.' }
    $friend = $friendRadio.Checked
    $name = Clean-Name $nameBox.Text; if (-not $name) { $name = 'Player' }
    $state.gameDir = $game; $state.role = $(if ($friend) { 'friend' } else { 'host' }); $state.name = $name; $state.hostIp = $ipBox.Text.Trim()

    # 1. identidade
    if (Goldberg-Dir $game) {
      $cur = Goldberg-Identity $game
      if (-not $friend -and $keepShared.Checked) { $id = if ($cur.id) { $cur.id } else { $SharedId } }
      else { if (-not $state.steamId -or $state.steamId -eq $SharedId) { $state.steamId = New-SteamId }; $id = $state.steamId }
      if ($cur.id -ne $id -or $cur.name -ne $name) {
        $ok = [Windows.Forms.MessageBox]::Show("Gravar na cópia do jogo o ID $id e o nome `"$name`"?`n(os arquivos antigos ficam salvos como .launcher.bak)", 'Identidade do jogador', 'YesNo', 'Question')
        if ($ok -ne 'Yes') { throw 'Cancelado.' }
      }
      Write-Goldberg $game $id $name
    }
    Save-State $state

    # 2. servidor: host abre o servidor local; amigo abre o conector apontando para o host
    if ($friend) {
      if (-not ($state.hostIp -as [ipaddress])) { throw 'Digite o IP do host (ex.: 26.x.x.x do Radmin VPN).' }
      if (-not (Test-Port 21022)) {
        $status.Text = "Conectando ao host $($state.hostIp)..."; $form.Refresh()
        Start-Process -FilePath 'node' -ArgumentList @('friend-proxy.cjs', $state.hostIp) -WorkingDirectory (Join-Path $Root 'server-lab') -WindowStyle Minimized
      }
    } elseif (-not (Test-Port 21022)) {
      $status.Text = 'Abrindo o servidor...'; $form.Refresh()
      Start-Process -FilePath (Join-Path $Root 'Iniciar-Servidor.cmd') -WorkingDirectory $Root -WindowStyle Minimized
    }
    $deadline = (Get-Date).AddSeconds(20)
    while (-not (Test-Port 21022)) { if ((Get-Date) -gt $deadline) { throw 'O servidor não respondeu em 127.0.0.1:21022.' }; Start-Sleep -Milliseconds 500 }

    # 3. jogo (redirecionamento + módulos)
    $status.Text = 'Abrindo o NBA 2K22...'; $form.Refresh()
    $env:NBA2K22_EXE = Join-Path $game 'NBA2K22.exe'
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'redirect\Start-Capture.ps1') 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw ($out.Trim() -split "`n" | Select-Object -Last 3) -join ' ' }
    $status.Text = "NBA 2K22 iniciado como `"$name`". Pode deixar o launcher aberto ou fechar."
  } catch {
    $status.Text = "Erro: $($_.Exception.Message)"
  } finally { $play.Enabled = $true }
})

Refresh-Ui
[void]$form.ShowDialog()
