#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
static wchar_t logPath[MAX_PATH];
using LookupFn=DWORD*(__fastcall*)(void*,DWORD*,void**,DWORD);
static LookupFn original;
static DWORD* __fastcall lookupHook(void* self,DWORD* status,void** request,DWORD service){
 uintptr_t caller=(uintptr_t)__builtin_return_address(0)-(uintptr_t)GetModuleHandleW(nullptr);
 auto result=original(self,status,request,service);DWORD error=GetLastError();
 char line[190];snprintf(line,sizeof(line),"service-lookup pid=%lu caller_rva=0x%llx service=0x%08lx status=0x%08lx request_present=%u\r\n",GetCurrentProcessId(),(unsigned long long)caller,service,status?*status:0,(unsigned)(request&&*request));
 HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}SetLastError(error);return result;
}
extern "C" __declspec(dllexport) DWORD StartServiceLookupDiagnostic(){wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;void* target=nullptr;
 if(lstrcmpiW(name,L"NBA2K22.exe")==0){target=(unsigned char*)GetModuleHandleW(nullptr)+0x207d050;const unsigned char expected[]={72,137,116,36,24,87,65,86,65,87,72,131,236,64,65,139};if(memcmp(target,expected,16))return 2;}
 else if(lstrcmpiW(name,L"service-lookup-selftest.exe")==0)target=(void*)GetProcAddress(GetModuleHandleW(nullptr),"LookupFixture");
 if(!target)return 3;if(MH_Initialize()!=MH_OK)return 4;if(MH_CreateHook(target,(void*)lookupHook,(void**)&original)!=MH_OK){MH_Uninitialize();return 5;}if(MH_EnableHook(target)!=MH_OK){MH_Uninitialize();return 6;}return 0;}
static DWORD WINAPI start(LPVOID){DWORD result=StartServiceLookupDiagnostic();char line[80];snprintf(line,sizeof(line),"service-lookup pid=%lu startup=%lu\r\n",GetCurrentProcessId(),result);HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}return result;}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"service-lookup.log");wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;if(lstrcmpiW(name,L"NBA2K22.exe")==0){HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}}return TRUE;}
