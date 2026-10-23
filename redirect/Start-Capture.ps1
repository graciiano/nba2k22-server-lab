$ErrorActionPreference='Stop'
# Inicia o NBA 2K22 com o redirecionamento para o servidor local e os modulos do laboratorio.
# No PC do host (caminho padrao) usa o lancador e os observadores ja validados pelo Codex.
# Em outro caminho (PC de amigo) injeta SessionRedirect-v5.dll e os modulos por PowerShell,
# porque os EXEs compilados comparam o caminho completo do jogo.
$defaultPath='C:\Users\Diogo\Downloads\nba 2k22\NBA 2K22\NBA2K22.exe'
$gamePath=if($env:NBA2K22_EXE){$env:NBA2K22_EXE}else{$defaultPath}
if(-not (Test-Path -LiteralPath $gamePath)){throw "NBA2K22.exe nao encontrado em $gamePath (defina a variavel NBA2K22_EXE)"}
if((Get-FileHash -LiteralPath $gamePath -Algorithm SHA256).Hash.ToLower() -ne '1727ad72085fba39e789ee574fc15aab623ad1651cf6879e95e8cd53b6ffbbf5'){throw 'NBA2K22.exe diferente da versao analisada; os enderecos dos modulos nao valem para ele'}
if(Get-Process NBA2K22 -ErrorAction SilentlyContinue){throw 'Feche o NBA2K22 antes de iniciar de novo'}
$client=[System.Net.Sockets.TcpClient]::new()
try{$client.Connect('127.0.0.1',21022)}catch{throw 'Servidor nao esta rodando em 127.0.0.1:21022. Abra Iniciar-Servidor.cmd (ou, no PC do amigo, Conectar-Amigo.cmd) primeiro.'}finally{$client.Dispose()}
$modules=@(@('free-attribute-prices.enabled','AttachFreeAttributePrices.exe','FreeAttributePrices.dll'),@('block-vc-purchase.enabled','AttachBlockVcPurchase.exe','BlockVcPurchase.dll'),@('unlock-progression.enabled','AttachUnlockProgression.exe','UnlockProgression.dll'))

if([string]::Equals((Resolve-Path -LiteralPath $gamePath).Path,$defaultPath,[StringComparison]::OrdinalIgnoreCase)){
  & (Join-Path $PSScriptRoot 'CaptureLauncherV5.exe')
  if($LASTEXITCODE -ne 0){throw "Lancador falhou: $LASTEXITCODE"}
  Start-Sleep -Seconds 1
  $game=Get-Process NBA2K22 -ErrorAction Stop
  foreach($observer in @('AttachLoadDiagnostic.exe','AttachServiceErrorDiagnostic.exe','AttachPlayerStatusDiagnostic.exe','AttachContextDiagnostic.exe','AttachActivityEventDiagnostic.exe','AttachServiceLookupDiagnostic.exe','AttachWorldValidationDiagnostic.exe','AttachWebSocketConnectDiagnostic.exe','AttachEntryResponseDiagnostic.exe','AttachMyCourtDiagnostic.exe','AttachMyCourtGameplayDiagnostic.exe','AttachMyCourtLoadDiagnostic.exe')){
    $helper=Join-Path $PSScriptRoot $observer
    if(Test-Path -LiteralPath $helper){& $helper $game.Id;if($LASTEXITCODE -ne 0){Write-Warning "Observador nao anexado: $observer ($LASTEXITCODE)"}}
  }
  foreach($m in $modules){if(Test-Path -LiteralPath (Join-Path $PSScriptRoot $m[0])){& (Join-Path $PSScriptRoot $m[1]) $game.Id;if($LASTEXITCODE -ne 0){throw "Modulo falhou: $($m[1])"}}}
}else{
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class LabInject {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO { public int cb; public string lpReserved, lpDesktop, lpTitle; public int dwX,dwY,dwXSize,dwYSize,dwXCountChars,dwYCountChars,dwFillAttribute,dwFlags; public short wShowWindow,cbReserved2; public IntPtr lpReserved2,hStdInput,hStdOutput,hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess,hThread; public int dwProcessId,dwThreadId; }
  [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool CreateProcessW(string app,string cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string dir,ref STARTUPINFO si,out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr VirtualAllocEx(IntPtr p,IntPtr a,UIntPtr size,uint type,uint protect);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool VirtualFreeEx(IntPtr p,IntPtr a,UIntPtr size,uint type);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteProcessMemory(IntPtr p,IntPtr a,byte[] b,UIntPtr size,out UIntPtr written);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateRemoteThread(IntPtr p,IntPtr attr,UIntPtr stack,IntPtr start,IntPtr param,uint flags,IntPtr id);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h,uint ms);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeThread(IntPtr h,out uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr h);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr h,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll",CharSet=CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr m,string name);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandleW(string name);
  static void Load(IntPtr process,string dll){
    byte[] b=Encoding.Unicode.GetBytes(dll+"\0");
    IntPtr mem=VirtualAllocEx(process,IntPtr.Zero,(UIntPtr)b.Length,0x3000,4);
    if(mem==IntPtr.Zero) throw new Exception("VirtualAllocEx "+Marshal.GetLastWin32Error());
    UIntPtr w; if(!WriteProcessMemory(process,mem,b,(UIntPtr)b.Length,out w)) throw new Exception("WriteProcessMemory "+Marshal.GetLastWin32Error());
    IntPtr load=GetProcAddress(GetModuleHandleW("kernel32.dll"),"LoadLibraryW");
    IntPtr t=CreateRemoteThread(process,IntPtr.Zero,UIntPtr.Zero,load,mem,0,IntPtr.Zero);
    if(t==IntPtr.Zero) throw new Exception("CreateRemoteThread "+Marshal.GetLastWin32Error());
    WaitForSingleObject(t,15000); uint code; GetExitCodeThread(t,out code); CloseHandle(t);
    VirtualFreeEx(process,mem,UIntPtr.Zero,0x8000);
    if(code==0) throw new Exception("LoadLibraryW falhou: "+dll);
  }
  public static int Launch(string exe,string dir,string dll){
    var si=new STARTUPINFO(); si.cb=Marshal.SizeOf(si); PROCESS_INFORMATION pi;
    if(!CreateProcessW(exe,"\""+exe+"\"",IntPtr.Zero,IntPtr.Zero,false,4,IntPtr.Zero,dir,ref si,out pi)) throw new Exception("CreateProcess "+Marshal.GetLastWin32Error());
    try{ Load(pi.hProcess,dll); }catch{ TerminateProcess(pi.hProcess,10); CloseHandle(pi.hThread); CloseHandle(pi.hProcess); throw; }
    ResumeThread(pi.hThread); CloseHandle(pi.hThread); CloseHandle(pi.hProcess); return pi.dwProcessId;
  }
  public static void Attach(int pid,string dll){
    IntPtr p=OpenProcess(0x043A,false,pid); if(p==IntPtr.Zero) throw new Exception("OpenProcess "+Marshal.GetLastWin32Error());
    try{ Load(p,dll); } finally { CloseHandle(p); }
  }
}
'@
  $full=(Resolve-Path -LiteralPath $gamePath).Path
  $gamePid=[LabInject]::Launch($full,(Split-Path $full -Parent),(Join-Path $PSScriptRoot 'SessionRedirect-v5.dll'))
  Start-Sleep -Seconds 1
  foreach($m in $modules){if(Test-Path -LiteralPath (Join-Path $PSScriptRoot $m[0])){[LabInject]::Attach($gamePid,(Join-Path $PSScriptRoot $m[2]))}}
  $game=Get-Process -Id $gamePid
}
# Diagnosticos de engenharia reversa (liga com o arquivo .enabled correspondente nesta pasta)
foreach($d in @(@('game-log.enabled','GameLogDiagnostics.dll'),@('park-collision.enabled','ParkCollisionDiagnostics.dll'),@('store-filter.enabled','StoreFilter.dll'))){
  if((Test-Path -LiteralPath (Join-Path $PSScriptRoot $d[0])) -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot $d[1]))){
    & (Join-Path $PSScriptRoot 'AttachDll.exe') $d[1] $game.Id
    if($LASTEXITCODE -ne 0){Write-Warning "Diagnostico nao anexado: $($d[1]) ($LASTEXITCODE)"}
  }
}
Write-Host "NBA 2K22 iniciado (PID $($game.Id)). Painel das quadras: http://127.0.0.1:21023/park"
