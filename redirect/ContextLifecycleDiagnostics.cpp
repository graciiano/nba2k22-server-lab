#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
static wchar_t logPath[MAX_PATH];
using ActivateFn=uintptr_t(__fastcall*)(void*,DWORD,uintptr_t,uintptr_t,DWORD,DWORD);
using StopFn=uintptr_t(__fastcall*)(void*);
static ActivateFn activateOriginal;static StopFn stopOriginal,resetOriginal,temporaryOriginal;
static uintptr_t readPointer(uintptr_t at){uintptr_t value=0;SIZE_T bytes=0;return ReadProcessMemory(GetCurrentProcess(),(void*)at,&value,sizeof(value),&bytes)&&bytes==sizeof(value)?value:0;}
static DWORD flag(void* self){return *(volatile DWORD*)((unsigned char*)self+0xde0);}
static void record(const char* event,uintptr_t caller,DWORD before,DWORD after,void* self=nullptr){
 uintptr_t base=(uintptr_t)GetModuleHandleW(nullptr),vtable=self?readPointer((uintptr_t)self):0;bool isWorld=false;wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;if(self&&lstrcmpiW(name,L"NBA2K22.exe")==0){uintptr_t root=readPointer(base+0x676dd98);if(root){uintptr_t manager=readPointer(root+0x38);if(manager)isWorld=readPointer(manager+0x260)==(uintptr_t)self;}}uintptr_t typeRva=(vtable>=base&&vtable<base+0x6dba000)?vtable-base:0;char line[240];snprintf(line,sizeof(line),"context pid=%lu event=%s caller_rva=0x%llx before=%lu after=%lu type_rva=0x%llx current_world_context=%u\r\n",GetCurrentProcessId(),event,(unsigned long long)caller,before,after,(unsigned long long)typeRva,(unsigned)isWorld);
 HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);
 if(h!=INVALID_HANDLE_VALUE){DWORD written;WriteFile(h,line,(DWORD)strlen(line),&written,nullptr);CloseHandle(h);}
}
static uintptr_t __fastcall activateHook(void* self,DWORD mode,uintptr_t p,uintptr_t q,DWORD a,DWORD b){
 DWORD incoming=GetLastError(),before=flag(self);uintptr_t caller=(uintptr_t)__builtin_return_address(0)-(uintptr_t)GetModuleHandleW(nullptr);
 SetLastError(incoming);uintptr_t result=activateOriginal(self,mode,p,q,a,b);DWORD error=GetLastError();
 record("activate",caller,before,flag(self),self);SetLastError(error);return result;
}
static uintptr_t __fastcall stopHook(void* self){
 DWORD incoming=GetLastError(),before=flag(self);uintptr_t caller=(uintptr_t)__builtin_return_address(0)-(uintptr_t)GetModuleHandleW(nullptr);
 SetLastError(incoming);uintptr_t result=stopOriginal(self);DWORD error=GetLastError();
 record("deactivate",caller,before,flag(self),self);SetLastError(error);return result;
}
static uintptr_t __fastcall resetHook(void* self){DWORD incoming=GetLastError(),before=flag(self);uintptr_t caller=(uintptr_t)__builtin_return_address(0)-(uintptr_t)GetModuleHandleW(nullptr);SetLastError(incoming);uintptr_t result=resetOriginal(self);DWORD error=GetLastError();record("reset",caller,before,flag(self),self);SetLastError(error);return result;}
static uintptr_t __fastcall temporaryHook(void* self){DWORD incoming=GetLastError(),before=flag(self);uintptr_t caller=(uintptr_t)__builtin_return_address(0)-(uintptr_t)GetModuleHandleW(nullptr);SetLastError(incoming);uintptr_t result=temporaryOriginal(self);DWORD error=GetLastError();record("temporary-ready-cycle",caller,before,flag(self),self);SetLastError(error);return result;}
extern "C" __declspec(dllexport) DWORD StartContextDiagnostic(){
 wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;void* first=nullptr;void* second=nullptr;void* third=nullptr;void* fourth=nullptr;
 if(lstrcmpiW(name,L"NBA2K22.exe")==0){
  auto base=(unsigned char*)GetModuleHandleW(nullptr);first=base+0x188b3a0;second=base+0x188b530;third=base+0x188a7e0;fourth=base+0x1b68840;
  const unsigned char activateExpected[]={72,137,92,36,8,72,137,108,36,16,72,137,116,36,24,87};const unsigned char stopExpected[]={64,83,72,131,236,32,72,139,217,72,129,193,152,2,0,0};
  const unsigned char resetExpected[]={72,137,92,36,16,72,137,108,36,24,87,72,131,236,32,72};const unsigned char temporaryExpected[]={72,137,92,36,24,87,72,131,236,112,131,185,224,13,0,0};
  if(memcmp(first,activateExpected,16)||memcmp(second,stopExpected,16)||memcmp(third,resetExpected,16)||memcmp(fourth,temporaryExpected,16))return 2;
 }else if(lstrcmpiW(name,L"context-selftest.exe")==0){first=(void*)GetProcAddress(GetModuleHandleW(nullptr),"ActivateFixture");second=(void*)GetProcAddress(GetModuleHandleW(nullptr),"StopFixture");third=(void*)GetProcAddress(GetModuleHandleW(nullptr),"ResetFixture");fourth=(void*)GetProcAddress(GetModuleHandleW(nullptr),"TemporaryFixture");}
 if(!first||!second||!third||!fourth)return 3;if(MH_Initialize()!=MH_OK)return 4;
 if(MH_CreateHook(first,(void*)activateHook,(void**)&activateOriginal)!=MH_OK||MH_CreateHook(second,(void*)stopHook,(void**)&stopOriginal)!=MH_OK||MH_CreateHook(third,(void*)resetHook,(void**)&resetOriginal)!=MH_OK||MH_CreateHook(fourth,(void*)temporaryHook,(void**)&temporaryOriginal)!=MH_OK){MH_Uninitialize();return 5;}
 if(MH_EnableHook(first)!=MH_OK||MH_EnableHook(second)!=MH_OK||MH_EnableHook(third)!=MH_OK||MH_EnableHook(fourth)!=MH_OK){MH_DisableHook(first);MH_DisableHook(second);MH_DisableHook(third);MH_DisableHook(fourth);MH_Uninitialize();return 6;}
 record("ready",0,0,0);return 0;
}
static DWORD WINAPI start(LPVOID){DWORD result=StartContextDiagnostic();if(result)record("refused",0,result,result);return result;}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"context-lifecycle.log");wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;if(lstrcmpiW(name,L"NBA2K22.exe")==0){HANDLE thread=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(thread)CloseHandle(thread);}}return TRUE;}

