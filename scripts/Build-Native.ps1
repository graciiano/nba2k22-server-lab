param([Parameter(Mandatory=$true)][string]$CompilerRoot,[Parameter(Mandatory=$true)][string]$MinHookRoot)
$ErrorActionPreference='Stop'
$native=Join-Path (Split-Path $PSScriptRoot -Parent) 'redirect'
$cc=Join-Path $CompilerRoot 'x86_64-w64-mingw32-clang.exe'
$cxx=Join-Path $CompilerRoot 'x86_64-w64-mingw32-clang++.exe'
$include=Join-Path $MinHookRoot 'include'
$objects=@()
foreach($src in @('buffer.c','hook.c','trampoline.c','hde/hde64.c')){
 $file=Join-Path $MinHookRoot ('src/'+$src);$obj=Join-Path $native (('mh-'+($src -replace '/','-'))+'.o')
 & $cc -O2 -c $file -I $include -o $obj;if($LASTEXITCODE){throw "C compilation failed: $src"};$objects+=$obj
}
$dlls=@{WorkerDiagnostics='SessionRedirect-v5';LoadStateDiagnostics='LoadStateDiagnostics-v2';ContextLifecycleDiagnostics='ContextLifecycleDiagnostics-v2'}
foreach($name in @('ServiceErrorDiagnostics','PlayerStatusDiagnostics','ActivityEventDiagnostics','ServiceLookupDiagnostics','WorldValidationDiagnostics','WebSocketConnectDiagnostics','EntryResponseDiagnostics','MyCourtDiagnostics','MyCourtGameplayDiagnostics','MyCourtLoadDiagnostics','FreeAttributePrices','BlockVcPurchase','UnlockProgression')){$dlls[$name]=$name}
foreach($src in $dlls.Keys){
 & $cxx -shared -O2 -static (Join-Path $native ($src+'.cpp')) -I $include @objects -lwinhttp -o (Join-Path $native ($dlls[$src]+'.dll'))
 if($LASTEXITCODE){throw "DLL compilation failed: $src"}
}
foreach($file in (Get-ChildItem $native -File -Filter 'Attach*.cpp')){
 & $cxx -O2 -static -municode $file.FullName -o (Join-Path $native ($file.BaseName+'.exe'));if($LASTEXITCODE){throw "Helper compilation failed: $($file.Name)"}
}
& $cxx -O2 -static -municode (Join-Path $native 'CaptureLauncherV5.cpp') -o (Join-Path $native 'CaptureLauncherV5.exe')
if($LASTEXITCODE){throw 'Launcher compilation failed'}
Write-Host 'Native sources compiled. No game process was started.'
