#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
using OpenFn=void(__fastcall*)(void*,void*);
using PopFn=void(__fastcall*)(DWORD,DWORD);
static OpenFn original;static PopFn pop;
static wchar_t logPath[MAX_PATH],enabledPath[MAX_PATH];static BOOL* fixtureEnabled;
static bool enabled(){return fixtureEnabled?*fixtureEnabled!=0:GetFileAttributesW(enabledPath)!=INVALID_FILE_ATTRIBUTES;}
static void log(const char* event,DWORD result){char line[110];snprintf(line,sizeof(line),"block-vc-purchase pid=%lu event=%s result=%lu\r\n",GetCurrentProcessId(),event,result);HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}}
static void __fastcall openHook(void* self,void* view){if(!enabled()){original(self,view);return;}log("vc-menu-entry-cancelled",0);pop(0x8ac013a5,0xd8);}
extern "C" __declspec(dllexport) DWORD StartBlockVcPurchase(){
 wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;void* target=nullptr;
 if(lstrcmpiW(name,L"NBA2K22.exe")==0){auto base=(unsigned char*)GetModuleHandleW(nullptr);target=base+0x13ac670;pop=(PopFn)(base+0xec4b20);const unsigned char expected[]={72,137,92,36,8,72,137,116,36,16,87,72,131,236,32,51};const unsigned char popExpected[]={137,76,36,8,83,72,131,236,112,139,218,232,176,92,206,255};if(memcmp(target,expected,16)||memcmp((void*)pop,popExpected,16))return 2;}
 else if(lstrcmpiW(name,L"block-vc-purchase-selftest.exe")==0){auto module=GetModuleHandleW(nullptr);target=(void*)GetProcAddress(module,"OpenFixture");pop=(PopFn)GetProcAddress(module,"PopFixture");fixtureEnabled=(BOOL*)GetProcAddress(module,"FixtureEnabled");}
 if(!target||!pop)return 3;if(MH_Initialize()!=MH_OK)return 4;if(MH_CreateHook(target,(void*)openHook,(void**)&original)!=MH_OK){MH_Uninitialize();return 5;}if(MH_EnableHook(target)!=MH_OK){MH_Uninitialize();return 6;}return 0;
}
static DWORD WINAPI start(LPVOID){DWORD result=StartBlockVcPurchase();log("startup",result);return result;}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"block-vc-purchase.log");GetModuleFileNameW(module,enabledPath,MAX_PATH);slash=wcsrchr(enabledPath,L'\\');if(slash)lstrcpyW(slash+1,L"block-vc-purchase.enabled");wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;if(lstrcmpiW(name,L"NBA2K22.exe")==0){HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}}return TRUE;}
