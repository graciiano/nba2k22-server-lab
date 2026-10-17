#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
using UpdateFn=uintptr_t(__fastcall*)(void*,float);static UpdateFn original;static wchar_t logPath[MAX_PATH];
static DWORD read32(uintptr_t at){DWORD v=0;SIZE_T n;ReadProcessMemory(GetCurrentProcess(),(void*)at,&v,4,&n);return v;}
static uintptr_t ptr(uintptr_t at){uintptr_t v=0;SIZE_T n;ReadProcessMemory(GetCurrentProcess(),(void*)at,&v,8,&n);return v;}
static void log(const char* event,DWORD phase,DWORD load,DWORD request,DWORD ready){char line[220];snprintf(line,sizeof(line),"mycourt-load pid=%lu event=%s phase=%lu customization_stage=%lu request_state=%lu verified=%lu\r\n",GetCurrentProcessId(),event,phase,load,request,ready);HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}}
static uintptr_t __fastcall update(void* self,float elapsed){auto result=original(self,elapsed);DWORD error=GetLastError();uintptr_t s=(uintptr_t)self,parent=ptr(s+0x10);DWORD phase=read32(s+0x20),load=parent?read32(parent+0x45c):0,request=parent?read32(parent+0x464):0,ready=read32(s+0x60);static DWORD a=~0u,b=~0u,c=~0u,d=~0u;if(phase!=a||load!=b||request!=c||ready!=d){a=phase;b=load;c=request;d=ready;log("update",phase,load,request,ready);}SetLastError(error);return result;}
static DWORD WINAPI start(LPVOID){wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');if(!name||lstrcmpiW(name+1,L"NBA2K22.exe"))return 1;auto target=(unsigned char*)GetModuleHandleW(nullptr)+0x456ba0;const unsigned char bytes[]={72,139,196,85,83,72,141,104,161,72,129,236,216,0,0,0};if(memcmp(target,bytes,16))return 2;if(MH_Initialize()!=MH_OK||MH_CreateHook(target,(void*)update,(void**)&original)!=MH_OK||MH_EnableHook(target)!=MH_OK)return 3;log("ready",0,0,0,0);return 0;}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto s=wcsrchr(logPath,L'\\');if(s)lstrcpyW(s+1,L"mycourt-load.log");HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}return TRUE;}
