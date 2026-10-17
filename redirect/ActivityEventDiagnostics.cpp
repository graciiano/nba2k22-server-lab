#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
static wchar_t logPath[MAX_PATH];
using EmitFn=uintptr_t(__fastcall*)(void*,DWORD,DWORD);
using DispatchFn=DWORD*(__fastcall*)(void*,DWORD*,DWORD,DWORD,void*,uintptr_t);
using ReceiveFn=DWORD*(__fastcall*)(void*,DWORD*,void*);
static EmitFn emitOriginal;static DispatchFn dispatchOriginal;static ReceiveFn receiveOriginal;
static bool testMode=false;
static DWORD readDword(uintptr_t p){DWORD v=0;SIZE_T n=0;ReadProcessMemory(GetCurrentProcess(),(void*)p,&v,sizeof(v),&n);return v;}
static uintptr_t readPointer(uintptr_t p){uintptr_t v=0;SIZE_T n=0;ReadProcessMemory(GetCurrentProcess(),(void*)p,&v,sizeof(v),&n);return v;}
static DWORD targetName(){uintptr_t base=(uintptr_t)GetModuleHandleW(nullptr),root=readPointer(base+0x676dd98);if(!root)return 0;uintptr_t manager=readPointer(root+0x38);return manager?readDword(manager+0x26c):0;}
static void record(const char* event,uintptr_t caller,DWORD status,DWORD before,DWORD after){char line[220];snprintf(line,sizeof(line),"activity-event pid=%lu event=%s tick=%llu caller_rva=0x%llx status=0x%08lx before=%lu after=%lu\r\n",GetCurrentProcessId(),event,(unsigned long long)GetTickCount64(),(unsigned long long)caller,status,before,after);HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}}
static uintptr_t __fastcall emitHook(void* self,DWORD name,DWORD operation){DWORD incoming=GetLastError();uintptr_t caller=(uintptr_t)__builtin_return_address(0)-(uintptr_t)GetModuleHandleW(nullptr);bool selected=testMode||(name!=0&&name==targetName());if(selected&&operation==0x7c81b33d)record("start-emitted",caller,0,0,0);SetLastError(incoming);uintptr_t result=emitOriginal(self,name,operation);DWORD error=GetLastError();if(selected&&operation==0x7c81b33d)record("start-emitter-returned",caller,0,0,0);SetLastError(error);return result;}
static DWORD* __fastcall dispatchHook(void* self,DWORD* output,DWORD group,DWORD event,void* fields,uintptr_t option){DWORD incoming=GetLastError();uintptr_t caller=(uintptr_t)__builtin_return_address(0)-(uintptr_t)GetModuleHandleW(nullptr);bool relevant=group==0x4f258439&&event==0x66b8b710;SetLastError(incoming);auto result=dispatchOriginal(self,output,group,event,fields,option);DWORD error=GetLastError();if(relevant)record("activity-dispatch-returned",caller,output?*output:0,0,0);SetLastError(error);return result;}
static DWORD* __fastcall receiveHook(void* self,DWORD* output,void* fields){DWORD incoming=GetLastError(),before=readDword((uintptr_t)self+0x274);uintptr_t caller=(uintptr_t)__builtin_return_address(0)-(uintptr_t)GetModuleHandleW(nullptr);SetLastError(incoming);auto result=receiveOriginal(self,output,fields);DWORD error=GetLastError();record("annex-receiver-returned",caller,output?*output:0,before,readDword((uintptr_t)self+0x274));SetLastError(error);return result;}
extern "C" __declspec(dllexport) DWORD StartActivityEventDiagnostic(){
 wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;void* emit=nullptr;void* dispatch=nullptr;void* receive=nullptr;
 if(lstrcmpiW(name,L"NBA2K22.exe")==0){auto base=(unsigned char*)GetModuleHandleW(nullptr);emit=base+0x16d5810;dispatch=base+0x1ec86c0;receive=base+0x45a710;
 const unsigned char emitExpected[]={72,137,92,36,16,72,137,108,36,24,72,137,116,36,32,87};const unsigned char dispatchExpected[]={72,137,92,36,16,72,137,108,36,24,72,137,116,36,32,87};const unsigned char receiveExpected[]={72,137,92,36,8,72,137,116,36,16,72,137,124,36,24,85};
 if(memcmp(emit,emitExpected,16)||memcmp(dispatch,dispatchExpected,16)||memcmp(receive,receiveExpected,16))return 2;
 }else if(lstrcmpiW(name,L"activity-event-selftest.exe")==0){testMode=true;emit=(void*)GetProcAddress(GetModuleHandleW(nullptr),"EmitFixture");dispatch=(void*)GetProcAddress(GetModuleHandleW(nullptr),"DispatchFixture");receive=(void*)GetProcAddress(GetModuleHandleW(nullptr),"ReceiveFixture");}
 if(!emit||!dispatch||!receive)return 3;if(MH_Initialize()!=MH_OK)return 4;
 if(MH_CreateHook(emit,(void*)emitHook,(void**)&emitOriginal)!=MH_OK||MH_CreateHook(dispatch,(void*)dispatchHook,(void**)&dispatchOriginal)!=MH_OK||MH_CreateHook(receive,(void*)receiveHook,(void**)&receiveOriginal)!=MH_OK){MH_Uninitialize();return 5;}
 if(MH_EnableHook(emit)!=MH_OK||MH_EnableHook(dispatch)!=MH_OK||MH_EnableHook(receive)!=MH_OK){MH_DisableHook(emit);MH_DisableHook(dispatch);MH_DisableHook(receive);MH_Uninitialize();return 6;}
 record("ready",0,0,0,0);return 0;
}
static DWORD WINAPI start(LPVOID){DWORD result=StartActivityEventDiagnostic();if(result)record("refused",0,result,0,0);return result;}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"activity-event.log");wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;if(lstrcmpiW(name,L"NBA2K22.exe")==0){HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}}return TRUE;}
