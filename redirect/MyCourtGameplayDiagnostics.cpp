#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
using UpdateFn=uintptr_t(__fastcall*)(void*,float);static UpdateFn original;static wchar_t logPath[MAX_PATH];
static DWORD read32(uintptr_t at){DWORD v=0;SIZE_T n;ReadProcessMemory(GetCurrentProcess(),(void*)at,&v,4,&n);return v;}
static uintptr_t ptr(uintptr_t at){uintptr_t v=0;SIZE_T n;ReadProcessMemory(GetCurrentProcess(),(void*)at,&v,8,&n);return v;}
static void log(const char* event,DWORD phase,DWORD load,DWORD request,DWORD ready){char line[220];snprintf(line,sizeof(line),"mycourt-gameplay-state pid=%lu event=%s primary=%lu crib=%lu couch=%lu room_state_crc=%lu\r\n",GetCurrentProcessId(),event,phase,load,request,ready);HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}}
static uintptr_t __fastcall update(void* self,float elapsed){auto result=original(self,elapsed);DWORD error=GetLastError();uintptr_t s=(uintptr_t)self,room=ptr(s+0x88);DWORD primary=read32(s+0x28),crib=read32(s+0x30),couch=read32(s+0x2c),roomState=room?read32(room+0xa4):0;static DWORD a=~0u,b=~0u,c=~0u,d=~0u;if(primary!=a||crib!=b||couch!=c||roomState!=d){a=primary;b=crib;c=couch;d=roomState;log("update",primary,crib,couch,roomState);}SetLastError(error);return result;}static DWORD WINAPI start(LPVOID){wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');if(!name||lstrcmpiW(name+1,L"NBA2K22.exe"))return 1;auto target=(unsigned char*)GetModuleHandleW(nullptr)+0x456950;const unsigned char bytes[]={64,83,72,131,236,112,131,121,32,0,72,139,217,15,41,116};if(memcmp(target,bytes,16))return 2;if(MH_Initialize()!=MH_OK||MH_CreateHook(target,(void*)update,(void**)&original)!=MH_OK||MH_EnableHook(target)!=MH_OK)return 3;log("ready",0,0,0,0);return 0;}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto s=wcsrchr(logPath,L'\\');if(s)lstrcpyW(s+1,L"mycourt-gameplay-state.log");HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}return TRUE;}


