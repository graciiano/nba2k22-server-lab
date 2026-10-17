$ErrorActionPreference='Stop'
$gamePath=$env:NBA2K22_EXE
if(-not $gamePath){throw 'Set NBA2K22_EXE to the original executable'}
if((Get-FileHash -LiteralPath $gamePath -Algorithm SHA256).Hash.ToLower() -ne '1727ad72085fba39e789ee574fc15aab623ad1651cf6879e95e8cd53b6ffbbf5'){throw 'NBA2K22.exe changed; redo analysis before capture'}
if(Get-Process NBA2K22 -ErrorAction SilentlyContinue){throw 'Close NBA2K22 before starting a new capture session'}
$lab=Join-Path (Split-Path $PSScriptRoot -Parent) 'server-lab'
# A ready loopback TLS listener must exist. We do not start the game if the laboratory is absent.
$client=[System.Net.Sockets.TcpClient]::new()
try{$client.Connect('127.0.0.1',21022)}catch{throw 'Start the server laboratory first: node server.cjs'}finally{$client.Dispose()}
& (Join-Path $PSScriptRoot 'CaptureLauncherV5.exe')
if($LASTEXITCODE -ne 0){throw "Capture launcher failed: $LASTEXITCODE"}
Start-Sleep -Seconds 1
$game=Get-Process NBA2K22 -ErrorAction Stop
foreach($observer in @('AttachLoadDiagnostic.exe','AttachServiceErrorDiagnostic.exe','AttachPlayerStatusDiagnostic.exe','AttachContextDiagnostic.exe','AttachActivityEventDiagnostic.exe','AttachServiceLookupDiagnostic.exe','AttachWorldValidationDiagnostic.exe','AttachWebSocketConnectDiagnostic.exe','AttachEntryResponseDiagnostic.exe','AttachMyCourtDiagnostic.exe','AttachMyCourtGameplayDiagnostic.exe','AttachMyCourtLoadDiagnostic.exe')){
  $helper=Join-Path $PSScriptRoot $observer
  if(Test-Path -LiteralPath $helper){& $helper $game.Id;if($LASTEXITCODE -ne 0){throw "Observer failed: $observer"}}
}
if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'free-attribute-prices.enabled')){
 & (Join-Path $PSScriptRoot 'AttachFreeAttributePrices.exe') $game.Id
 if($LASTEXITCODE -ne 0){throw 'Free attribute prices module failed to attach'}
}
if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'block-vc-purchase.enabled')){
 & (Join-Path $PSScriptRoot 'AttachBlockVcPurchase.exe') $game.Id
 if($LASTEXITCODE -ne 0){throw 'VC purchase blocker failed to attach'}
}
if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'unlock-progression.enabled')){
 & (Join-Path $PSScriptRoot 'AttachUnlockProgression.exe') $game.Id
 if($LASTEXITCODE -ne 0){throw 'Progression unlock module failed to attach'}
}
Write-Host 'Enter MyCareer and leave the game open for diagnostics. Captures are in:'
Write-Host (Join-Path $lab 'captures')







