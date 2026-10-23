@echo off
rem Compila as DLLs de diagnostico (GameLog, ParkCollision), o injetor AttachDll e o MemDump.
rem Se uma DLL estiver carregada no jogo, ela e renomeada para .old antes (o Windows permite renomear).
set B=C:\Users\Diogo\Tools\REA\llvm-mingw-20261006-ucrt-x86_64\bin
set MH=C:\Users\Diogo\.codex\.chatgpt-projects\g-p-6ace58b641c881919d77772767a8a91a\redirect\minhook-src
set R=%~dp0..\redirect
set O=%TEMP%\nba2k22-mhobj
if not exist "%O%" mkdir "%O%"
pushd "%O%"
"%B%\x86_64-w64-mingw32-clang.exe" -O2 -c "%MH%\src\buffer.c" "%MH%\src\hook.c" "%MH%\src\trampoline.c" "%MH%\src\hde\hde64.c" -I "%MH%\include" || goto fail
for %%N in (GameLogDiagnostics ParkCollisionDiagnostics StoreFilter) do (
  if exist "%R%\src\%%N.cpp" (
    if exist "%R%\%%N.dll" (
      del /q "%R%\%%N.dll.old" 2>nul
      move /y "%R%\%%N.dll" "%R%\%%N.dll.old" >nul 2>nul
    )
    "%B%\x86_64-w64-mingw32-clang++.exe" -shared -O2 -static "%R%\src\%%N.cpp" -I "%MH%\include" buffer.o hook.o trampoline.o hde64.o -o "%R%\%%N.dll" || goto fail
  )
)
"%B%\x86_64-w64-mingw32-clang++.exe" -O2 -static -municode "%R%\src\AttachDll.cpp" -o "%R%\AttachDll.exe" || goto fail
"%B%\x86_64-w64-mingw32-clang++.exe" -O2 -static "%R%\src\MemDump.cpp" -o "%R%\MemDump.exe" || goto fail
popd
echo BUILD_OK
exit /b 0
:fail
popd
echo BUILD_FAIL
exit /b 1
