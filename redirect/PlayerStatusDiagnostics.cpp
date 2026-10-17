#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
static wchar_t logPath[MAX_PATH];
static void record(const char* s){auto h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,s,(DWORD)strlen(s),&n,nullptr);CloseHandle(h);}}
using StatusFn=DWORD*(__fastcall*)(void*,DWORD*,DWORD);
static StatusFn original;
static SRWLOCK lock=SRWLOCK_INIT;
static uintptr_t callers[64];static DWORD statuses[64];static int used;
static DWORD* __fastcall statusHook(void* self,DWORD* status,DWORD kind){
 auto caller=(uintptr_t)__builtin_return_address(0)-(uintptr_t)GetModuleHandleW(nullptr);
 DWORD* result=original(self,status,kind);DWORD error=GetLastError();bool changed=false;
 AcquireSRWLockExclusive(&lock);int index=0;while(index<used&&callers[index]!=caller)++index;
 if(index<used){changed=status&&statuses[index]!=*status;if(status)statuses[index]=*status;}
 else if(used<64&&status){callers[used]=caller;statuses[used++]=*status;changed=true;}ReleaseSRWLockExclusive(&lock);
 if(changed){char line[180];snprintf(line,sizeof(line),"player-status pid=%lu caller_rva=0x%llx status=0x%08lx\r\n",GetCurrentProcessId(),(unsigned long long)caller,status?*status:0);record(line);}SetLastError(error);return result;
}
extern "C" __declspec(dllexport) DWORD StartPlayerStatusDiagnostic(){
 wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;void* target=nullptr;
 if(lstrcmpiW(name,L"NBA2K22.exe")==0){target=(unsigned char*)GetModuleHandleW(nullptr)+0xfe2600;const unsigned char expected[]={72,137,92,36,8,87,72,131,236,32,72,139,218,72,139,249};if(memcmp(target,expected,16)){record("player-status refused: prologue mismatch\r\n");return 2;}}
 else if(lstrcmpiW(name,L"player-status-selftest.exe")==0)target=(void*)GetProcAddress(GetModuleHandleW(nullptr),"PlayerStatusFixture");
 if(!target)return 3;if(MH_Initialize()!=MH_OK)return 4;if(MH_CreateHook(target,(void*)statusHook,(void**)&original)!=MH_OK)return 5;if(MH_EnableHook(target)!=MH_OK)return 6;
 char line[100];snprintf(line,sizeof(line),"player-status pid=%lu ready\r\n",GetCurrentProcessId());record(line);return 0;
}
static DWORD WINAPI start(LPVOID){return StartPlayerStatusDiagnostic();}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"player-status.log");wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;if(lstrcmpiW(name,L"NBA2K22.exe")==0){HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}}return TRUE;}
