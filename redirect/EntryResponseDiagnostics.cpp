#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
static wchar_t logPath[MAX_PATH];
using LookupFn=DWORD*(__fastcall*)(void*,DWORD*,void*);
static LookupFn original;
static DWORD* __fastcall lookupHook(void* self,DWORD* status,void* packet){
 uintptr_t caller=(uintptr_t)__builtin_return_address(0)-(uintptr_t)GetModuleHandleW(nullptr);
 auto result=original(self,status,packet);DWORD error=GetLastError();
 char line[150];snprintf(line,sizeof(line),"entry-response pid=%lu caller_rva=0x%llx status=0x%08lx\r\n",GetCurrentProcessId(),(unsigned long long)caller,status?*status:0);
 HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}SetLastError(error);return result;
}
extern "C" __declspec(dllexport) DWORD StartEntryResponseDiagnostic(){wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;void* target=nullptr;
 if(lstrcmpiW(name,L"NBA2K22.exe")==0){target=(unsigned char*)GetModuleHandleW(nullptr)+0x20aab10;const unsigned char expected[]={72,137,92,36,24,87,72,131,236,96,72,139,218,72,139,249};if(memcmp(target,expected,16))return 2;}
 else if(lstrcmpiW(name,L"entry-response-selftest.exe")==0)target=(void*)GetProcAddress(GetModuleHandleW(nullptr),"EntryFixture");
 if(!target)return 3;if(MH_Initialize()!=MH_OK)return 4;if(MH_CreateHook(target,(void*)lookupHook,(void**)&original)!=MH_OK){MH_Uninitialize();return 5;}if(MH_EnableHook(target)!=MH_OK){MH_Uninitialize();return 6;}return 0;}
static DWORD WINAPI start(LPVOID){DWORD result=StartEntryResponseDiagnostic();char line[80];snprintf(line,sizeof(line),"entry-response pid=%lu startup=%lu\r\n",GetCurrentProcessId(),result);HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}return result;}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"entry-response.log");wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;if(lstrcmpiW(name,L"NBA2K22.exe")==0){HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}}return TRUE;}
