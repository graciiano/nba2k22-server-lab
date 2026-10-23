# Captura das requisições do cliente da Steam contra o SEU servidor (observação pura, modo captura).
# Precisa de administrador (mexe no hosts e nos certificados confiáveis do Windows). Ao fechar (Ctrl+C), desfaz tudo:
# o hosts volta como estava e o certificado criado aqui é removido. NÃO toca no servidor de ninguém — aponta o
# endereço do jogo para 127.0.0.1 (o seu PC) e grava o que o jogo pede em server-lab\captures\.
param([int]$Port = 22004)
$ErrorActionPreference = 'Stop'
# Deteccao de admin independente de idioma (papel interno, nao o nome "Administrators"/"Administradores").
# Este script NUNCA abre outra janela: rode-o num PowerShell ja aberto como administrador.
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host 'Rode este script num PowerShell ABERTO COMO ADMINISTRADOR (botao direito > Executar como administrador). Nada foi alterado.' -ForegroundColor Red
  exit 1
}
$HostName = 'nba2k22-ws.2ksports.com'
$Root = $PSScriptRoot
$Lab = Join-Path $Root 'server-lab'
$Dir = Join-Path $Lab 'captures'; New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$Hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$HostsBak = Join-Path $Dir 'hosts-captura.bak'
$Pfx = Join-Path $Lab 'capture-host.pfx'; $ThumbFile = Join-Path $Lab 'capture-host.thumb'
$Pass = 'captura-local'
if (-not $env:REFERENCE_ROOT) { $env:REFERENCE_ROOT = 'C:\Users\Diogo\Downloads\2K19 Servers' }

function Restore {
  if (Test-Path $HostsBak) { Copy-Item $HostsBak $Hosts -Force; Remove-Item $HostsBak -Force; ipconfig /flushdns | Out-Null; Write-Host 'hosts restaurado.' }
  if (Test-Path $ThumbFile) {
    $t = (Get-Content $ThumbFile).Trim()
    foreach ($s in "Cert:\LocalMachine\Root\$t", "Cert:\CurrentUser\My\$t") { if (Test-Path $s) { Remove-Item $s -Force } }
    Remove-Item $ThumbFile, $Pfx, (Join-Path $Lab 'capture-host.cer') -ErrorAction SilentlyContinue
    Write-Host 'certificado de captura removido.'
  }
}

try {
  # 1. certificado do host (criado uma vez por sessão de captura) e confiado
  $cert = New-SelfSignedCertificate -DnsName $HostName -CertStoreLocation Cert:\CurrentUser\My -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(3) -FriendlyName 'NBA2K22 captura (seu servidor)' -KeyAlgorithm RSA -KeyLength 2048
  $pw = ConvertTo-SecureString $Pass -AsPlainText -Force
  try { Export-PfxCertificate -Cert $cert -FilePath $Pfx -Password $pw -CryptoAlgorithmOption AES256_SHA256 | Out-Null }
  catch { Export-PfxCertificate -Cert $cert -FilePath $Pfx -Password $pw | Out-Null }
  $cert.Thumbprint | Set-Content $ThumbFile
  $cer = Join-Path $Lab 'capture-host.cer'
  Export-Certificate -Cert $cert -FilePath $cer | Out-Null
  Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
  Write-Host "certificado confiavel para $HostName criado."

  # 2. hosts -> 127.0.0.1 (backup do arquivo inteiro para restaurar exatamente como estava)
  if (-not (Test-Path $HostsBak)) { Copy-Item $Hosts $HostsBak }
  $lines = @([IO.File]::ReadAllLines($Hosts) | Where-Object { $_ -notmatch "\b$([regex]::Escape($HostName))\b" })
  $lines += "127.0.0.1`t$HostName`t# NBA2K22 captura (seu servidor)"
  [IO.File]::WriteAllLines($Hosts, $lines)
  ipconfig /flushdns | Out-Null
  Write-Host "hosts: $HostName -> 127.0.0.1"

  # 3. servidor em modo captura, na porta que o cliente usa
  $env:CAPTURE_PFX = $Pfx; $env:CAPTURE_PFX_PASS = $Pass; $env:PORT = "$Port"
  Write-Host ''
  Write-Host '== CAPTURA LIGADA ==' -ForegroundColor Green
  Write-Host 'Feche o NBA 2K22 se estiver aberto e abra de novo pela Steam. Entre no menu online, loja e park.'
  Write-Host 'Deixe esta janela aberta. Quando terminar, aperte Ctrl+C aqui para desfazer tudo.'
  Write-Host ''
  Set-Location $Lab
  node capture-login.cjs
}
finally { Restore; Write-Host 'Captura encerrada.' }
