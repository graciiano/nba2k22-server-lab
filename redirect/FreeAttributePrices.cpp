#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include "MinHook.h"
using ResetFn=void(__fastcall*)();
static ResetFn original;
static DWORD* state;
static unsigned char* prices;
static volatile LONG64* balance;
static wchar_t logPath[MAX_PATH],enabledPath[MAX_PATH];
static const size_t PriceBytes=24*75*8;
static void applyFreePrices(const char* event){
 if(GetFileAttributesW(enabledPath)==INVALID_FILE_ATTRIBUTES)return;
 DWORD before=*state;
 ZeroMemory(prices,PriceBytes);MemoryBarrier();InterlockedExchange((volatile LONG*)state,2);
 if(balance)InterlockedExchange64(balance,2000000);
 char line[150];snprintf(line,sizeof(line),"free-attribute-prices pid=%lu event=%s state_before=%lu state_after=2 entries=1800 caps_changed=0\r\n",GetCurrentProcessId(),event,before);
 HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}
}
static void __fastcall resetHook(){original();DWORD error=GetLastError();applyFreePrices("reset");SetLastError(error);}
extern "C" __declspec(dllexport) DWORD StartFreeAttributePrices(){
 wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;void* target=nullptr;
 if(lstrcmpiW(name,L"NBA2K22.exe")==0){auto base=(unsigned char*)GetModuleHandleW(nullptr);target=base+0x5e2e50;const unsigned char expected[]={72,137,92,36,8,72,137,116,36,16,87,72,131,236,96,51};if(memcmp(target,expected,16))return 2;state=(DWORD*)(base+0x5279800);prices=base+0x5279804;}
 else if(lstrcmpiW(name,L"free-attribute-prices-selftest.exe")==0){auto module=GetModuleHandleW(nullptr);target=(void*)GetProcAddress(module,"ResetFixture");state=(DWORD*)GetProcAddress(module,"PriceFixtureState");prices=(unsigned char*)GetProcAddress(module,"PriceFixtureTable");}
 if(!target||!state||!prices)return 3;if(GetFileAttributesW(enabledPath)==INVALID_FILE_ATTRIBUTES)return 8;
 if(MH_Initialize()!=MH_OK)return 4;if(MH_CreateHook(target,(void*)resetHook,(void**)&original)!=MH_OK){MH_Uninitialize();return 5;}if(MH_EnableHook(target)!=MH_OK){MH_Uninitialize();return 6;}
 if(lstrcmpiW(name,L"NBA2K22.exe")==0)balance=(volatile LONG64*)((unsigned char*)GetModuleHandleW(nullptr)+0x648db08);
 applyFreePrices("initial");return 0;
}
static DWORD WINAPI start(LPVOID){return StartFreeAttributePrices();}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);auto slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"free-attribute-prices.log");GetModuleFileNameW(module,enabledPath,MAX_PATH);slash=wcsrchr(enabledPath,L'\\');if(slash)lstrcpyW(slash+1,L"free-attribute-prices.enabled");wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');name=name?name+1:exe;if(lstrcmpiW(name,L"NBA2K22.exe")==0){HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}}return TRUE;}
