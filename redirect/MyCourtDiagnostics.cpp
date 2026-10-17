#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
using RoleFn=int(__fastcall*)(void*);
using GenerateFn=void(__fastcall*)(void*);
static RoleFn roleOriginal;static GenerateFn generateOriginal;static wchar_t logPath[MAX_PATH];
static void record(const char* event,int value){char line[150];snprintf(line,sizeof(line),"mycourt-diagnostic pid=%lu event=%s value=%d\r\n",GetCurrentProcessId(),event,value);HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}}
static int __fastcall roleHook(void* self){int value=roleOriginal(self);DWORD error=GetLastError();static int previous=-1;if(value!=previous){previous=value;record("owner-role",value);}SetLastError(error);return value;}
static void __fastcall generateHook(void* self){DWORD error=GetLastError();record("generate-room-enter",0);SetLastError(error);generateOriginal(self);error=GetLastError();record("generate-room-return",0);SetLastError(error);}
static DWORD WINAPI start(LPVOID){auto base=(unsigned char*)GetModuleHandleW(nullptr);wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');if(!name||lstrcmpiW(name+1,L"NBA2K22.exe"))return 1;
 const unsigned char roleBytes[]={72,137,92,36,8,87,72,131,236,32,72,139,249,232,158,101},generateBytes[]={72,137,76,36,8,85,87,65,85,72,141,172,36,32,245,255};
 if(memcmp(base+0x1678290,roleBytes,16)||memcmp(base+0x1667720,generateBytes,16)){record("refused-prologue",2);return 2;}
 if(MH_Initialize()!=MH_OK||MH_CreateHook(base+0x1678290,(void*)roleHook,(void**)&roleOriginal)!=MH_OK||MH_CreateHook(base+0x1667720,(void*)generateHook,(void**)&generateOriginal)!=MH_OK||MH_EnableHook(MH_ALL_HOOKS)!=MH_OK){record("hook-failed",3);return 3;}record("ready",0);return 0;}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"mycourt-diagnostic.log");HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}return TRUE;}
