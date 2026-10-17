#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
static wchar_t logPath[MAX_PATH];
static void record(const char* s){HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,s,(DWORD)strlen(s),&n,nullptr);CloseHandle(h);}}
using ErrorFn=uintptr_t(__fastcall*)(DWORD);
using ServiceFn=DWORD*(__fastcall*)(void*,DWORD*,DWORD);
static ErrorFn originalError;
static ServiceFn originalService;
static uintptr_t __fastcall errorHook(DWORD code){
 auto base=(uintptr_t)GetModuleHandleW(nullptr);auto caller=(uintptr_t)__builtin_return_address(0);char line[180];
 DWORD previous=GetLastError();snprintf(line,sizeof(line),"park-exit pid=%lu code=0x%08lx caller_rva=0x%llx\r\n",GetCurrentProcessId(),code,(unsigned long long)(caller-base));record(line);SetLastError(previous);return originalError(code);
}
static DWORD* __fastcall serviceHook(void* self,DWORD* status,DWORD service){
 DWORD* result=originalService(self,status,service);DWORD error=GetLastError();
 if(service!=0xb5c3a734&&service!=0x010a933a){char line[180];snprintf(line,sizeof(line),"service-check pid=%lu service=0x%08lx status=0x%08lx\r\n",GetCurrentProcessId(),service,status?*status:0);record(line);}SetLastError(error);return result;
}
extern "C" __declspec(dllexport) DWORD StartServiceErrorDiagnostic(){
 wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;void* error=nullptr;void* service=nullptr;
 if(lstrcmpiW(name,L"NBA2K22.exe")==0){auto base=(unsigned char*)GetModuleHandleW(nullptr);error=base+0x1706160;service=base+0x207d6f0;
 const unsigned char errorBytes[]={137,76,36,8,76,139,220,72,131,236,88,131,61,94,67,135};
 const unsigned char serviceBytes[]={64,83,87,65,86,65,87,72,131,236,88,65,139,248,76,139};
 if(memcmp(error,errorBytes,16)||memcmp(service,serviceBytes,16)){record("service-error refused: prologue mismatch\r\n");return 2;}
 }else if(lstrcmpiW(name,L"service-error-selftest.exe")==0){error=(void*)GetProcAddress(GetModuleHandleW(nullptr),"ErrorFixture");service=(void*)GetProcAddress(GetModuleHandleW(nullptr),"ServiceFixture");}
 if(!error||!service)return 3;if(MH_Initialize()!=MH_OK)return 4;
 if(MH_CreateHook(error,(void*)errorHook,(void**)&originalError)!=MH_OK)return 5;
 if(MH_CreateHook(service,(void*)serviceHook,(void**)&originalService)!=MH_OK)return 6;
 if(MH_EnableHook(MH_ALL_HOOKS)!=MH_OK)return 7;
 char line[100];snprintf(line,sizeof(line),"service-error pid=%lu ready\r\n",GetCurrentProcessId());record(line);return 0;
}
static DWORD WINAPI start(LPVOID){return StartServiceErrorDiagnostic();}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"service-error.log");wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;if(lstrcmpiW(name,L"NBA2K22.exe")==0){HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}}return TRUE;}
