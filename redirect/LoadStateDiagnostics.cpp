#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
static wchar_t logPath[MAX_PATH];
static void record(const char* line){HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD written;WriteFile(h,line,(DWORD)strlen(line),&written,nullptr);CloseHandle(h);}}
using UpdateFn=uintptr_t(__fastcall*)(void*,void*);
static UpdateFn originalUpdate;
static LONG previousState=-1;
static uintptr_t __fastcall updateHook(void* self,void* context){
 auto bytes=(unsigned char*)self;
 LONG state=*(LONG*)(bytes+0x1fd8);
 if(InterlockedExchange(&previousState,state)!=state){
 char line[200];snprintf(line,sizeof(line),"world-load-state pid=%lu state=%ld connection_present=%d flag=%lu\r\n",GetCurrentProcessId(),state,*(void**)(bytes+0x70)!=nullptr,*(DWORD*)(bytes+0x1fc8));record(line);
 }
 uintptr_t result=originalUpdate(self,context);DWORD error=GetLastError();SetLastError(error);return result;
}
extern "C" __declspec(dllexport) DWORD StartLoadDiagnostic(){
 wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;
 void* target=nullptr;
 if(lstrcmpiW(name,L"NBA2K22.exe")==0){target=(unsigned char*)GetModuleHandleW(nullptr)+0x17248d0;
 const unsigned char expected[]={0x40,0x55,0x56,0x57,0x41,0x56,0x48,0x8d,0x6c,0x24,0xc1,0x48,0x81,0xec,0x88,0x00};
 if(memcmp(target,expected,16)){record("load-diagnostic refused: prologue mismatch\r\n");return 2;}
 }else if(lstrcmpiW(name,L"load-state-selftest.exe")==0)target=(void*)GetProcAddress(GetModuleHandleW(nullptr),"WorldUpdateFixture");
 if(!target)return 3;
 if(MH_Initialize()!=MH_OK)return 4;
 if(MH_CreateHook(target,(void*)updateHook,(void**)&originalUpdate)!=MH_OK)return 5;
 if(MH_EnableHook(target)!=MH_OK)return 6;
 char line[100];snprintf(line,sizeof(line),"load-diagnostic pid=%lu ready\r\n",GetCurrentProcessId());record(line);return 0;
}
static DWORD WINAPI start(LPVOID){return StartLoadDiagnostic();}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"load-state.log");wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;if(lstrcmpiW(name,L"NBA2K22.exe")==0){HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}}return TRUE;}
