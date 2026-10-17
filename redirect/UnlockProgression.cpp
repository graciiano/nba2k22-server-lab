#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include <math.h>
#include "MinHook.h"
using CapFn=int(__fastcall*)(int);
using MaxBadgeFn=int(__fastcall*)(int,int,int);
using CostFn=int(__fastcall*)(int,unsigned char,unsigned char);
using RatingFn=float(__fastcall*)(float);
using PotentialFn=int(__fastcall*)(int,int,int,int,const float*,int,int);
using BudgetFn=int(__fastcall*)();
static CapFn originalCap;
static BudgetFn originalBudget;
static unsigned char* image;
static wchar_t enabled[MAX_PATH],logPath[MAX_PATH];
static thread_local bool applying=false;
static bool readable(void* p,size_t n){MEMORY_BASIC_INFORMATION m{};return p&&VirtualQuery(p,&m,sizeof(m))&&m.State==MEM_COMMIT&&!(m.Protect&(PAGE_NOACCESS|PAGE_GUARD))&&(unsigned char*)p+n<=(unsigned char*)m.BaseAddress+m.RegionSize;}
static void apply(){
 if(applying||GetFileAttributesW(enabled)==INVALID_FILE_ATTRIBUTES)return;
 auto world=*(unsigned char**)(image+0x676dd98);
 if(!world||!readable(world,0x1fdc)||*(int*)(world+0x1fd8)!=11)return;
 auto u=*(unsigned char**)(image+0x632b4a8);if(!u||!readable(u+0x17958,0x1c0))return;
 int primary=*(int*)(u+0x17958),subtype=*(int*)(u+0x1795c);
 // Native max-badge table dimensions: 9 primary types, 18 subtypes, 99 badges.
 if(primary<0||primary>8||subtype<0||subtype>17)return;
 auto caps=(float*)(u+0x1798c);for(int i=0;i<24;i++)if(!isfinite(caps[i])||caps[i]<0||caps[i]>1)return;
 applying=true;int changedCaps=0,changedBadges=0;unsigned short points[9]{};
 for(int i=0;i<24;i++){int map=((int*)(image+0x2d3a5e0))[i];if(map<0||map>8)continue;if(((int*)(image+0x2d3a5b0))[map]==1&&caps[i]!=1.f){caps[i]=1.f;changedCaps++;}}
 auto maxBadge=(MaxBadgeFn)(image+0x19541c0);auto cost=(CostFn)(image+0x1952280);
 unsigned char maximum[99]{};int spent[9]{},budget[9]{};
 auto potential=(PotentialFn)(image+0x19537e0);
 int secondary=*(int*)(u+0x17960);
 if(secondary<0||secondary>8){applying=false;return;}
 for(int c=1;c<9;c++){
  budget[c]=potential(c,primary,subtype,secondary,caps,0,*(unsigned short*)(u+0x17a9c+c*2));
  if(budget[c]<0||budget[c]>1000){applying=false;return;}
 }
 for(int i=0;i<99;i++){
  int level=maxBadge(primary,subtype,i)&255;int category=((int*)(image+0x2d3a790))[i];
  if(level>4||category<0||category>8)continue;
  maximum[i]=(unsigned char)level;
  unsigned char current=u[0x17a00+i];if(current>level)current=(unsigned char)level;
  int needed=cost(i,0,current);if(needed>=0&&needed<1000)spent[category]+=needed;
 }
 bool rebuild[9]{};for(int c=1;c<9;c++)rebuild[c]=spent[c]>budget[c]||(spent[c]==0&&*(unsigned short*)(u+0x17a64+c*2)<budget[c]);
 int allocated[9]{};
 for(int i=0;i<99;i++){
  int c=((int*)(image+0x2d3a790))[i];if(c<0||c>8)continue;
  int level=u[0x17a00+i];if(level>maximum[i])level=maximum[i];
  if(c==0)level=maximum[i];
  else if(rebuild[c]){level=maximum[i];while(level>0&&allocated[c]+cost(i,0,(unsigned char)level)>budget[c])level--;allocated[c]+=cost(i,0,(unsigned char)level);}
  if(u[0x17a00+i]!=level){u[0x17a00+i]=(unsigned char)level;changedBadges++;}
 }
 bool pointsChanged=false;for(int i=1;i<9;i++){auto earned=(unsigned short*)(u+0x17a64+i*2);points[i]=(unsigned short)budget[i];if(*earned!=points[i]){*earned=points[i];pointsChanged=true;}}
 // 95..99 performance rating is separate from the attribute potential.
 float threshold=(float)*(int*)(image+0x683b50c);
 float rating=((RatingFn)(image+0x1952f80))(threshold);
 bool performanceChanged=false;
 if(isfinite(threshold)&&rating>=99.f&&rating<=100.f){auto performance=(float*)(u+0x17b0c);if(*performance<threshold){*performance=threshold;performanceChanged=true;}}
 if(changedCaps)*(DWORD*)(u+0x179fc)&=~2u;
 for(int i=0;i<24;i++)((int*)(image+0x527d5a0))[i]=originalCap(i);
 if(changedCaps||changedBadges||pointsChanged||performanceChanged){
  char line[300];snprintf(line,sizeof(line),"unlock-progression pid=%lu caps_released=%d badges_updated=%d badge_points_granted=%d budget1=%d budget2=%d budget3=%d budget4=%d performance99=%d current_attributes_changed=0\r\n",GetCurrentProcessId(),changedCaps,changedBadges,pointsChanged,budget[1],budget[2],budget[3],budget[4],performanceChanged);
  HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}
 }
 applying=false;
}
static int __fastcall capHook(int attribute){DWORD error=GetLastError();apply();SetLastError(error);int cap=originalCap(attribute);if(attribute>=0&&attribute<24)((int*)(image+0x527d5a0))[attribute]=cap;return cap;}
static int __fastcall budgetHook(){
 if(GetFileAttributesW(enabled)==INVALID_FILE_ATTRIBUTES)return originalBudget();
 auto world=*(unsigned char**)(image+0x676dd98);if(!world||!readable(world,0x1fdc)||*(int*)(world+0x1fd8)!=11)return originalBudget();
 apply();
 auto u=*(unsigned char**)(image+0x632b4a8);if(!u||!readable(u+0x17958,0x1c0))return originalBudget();
 int total=0,spent=0;auto hasLevels=(CapFn)(image+0x19571e0);auto maximum=(CapFn)(image+0x11cfac0);auto level=(CapFn)(image+0x11cde30);
 for(int i=0;i<24;i++)if(hasLevels(i)){int max=maximum(i);if(max<1||max>75)return originalBudget();total+=max-1;spent+=level(i)-1;}
 static int lastSpent=-1,lastTotal=-1;
 if(spent!=lastSpent||total!=lastTotal){lastSpent=spent;lastTotal=total;int before=originalBudget();char line[200];snprintf(line,sizeof(line),"upgrade-budget pid=%lu earned_before=%d earned_unlocked=%d spent=%d available=%d\r\n",GetCurrentProcessId(),before,total,spent,total-spent);HANDLE h=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,line,(DWORD)strlen(line),&n,nullptr);CloseHandle(h);}}
 return total;
}
static DWORD WINAPI start(LPVOID){
 image=(unsigned char*)GetModuleHandleW(nullptr);wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);auto name=wcsrchr(exe,L'\\');if(!name||lstrcmpiW(name+1,L"NBA2K22.exe"))return 1;
 const unsigned char expected[]={72,137,92,36,8,87,72,131,236,48,72,139,5,23,213,21};auto target=image+0x11cdf80;if(memcmp(target,expected,16))return 2;
 const unsigned char budgetExpected[]={72,139,196,72,137,88,8,72,137,104,16,72,137,112,24,87};auto budgetTarget=image+0x11d21f0;if(memcmp(budgetTarget,budgetExpected,16))return 4;
 if(MH_Initialize()!=MH_OK||MH_CreateHook(target,(void*)capHook,(void**)&originalCap)!=MH_OK||MH_CreateHook(budgetTarget,(void*)budgetHook,(void**)&originalBudget)!=MH_OK||MH_EnableHook(MH_ALL_HOOKS)!=MH_OK)return 3;
 return 0;
}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){DisableThreadLibraryCalls(module);GetModuleFileNameW(module,enabled,MAX_PATH);auto slash=wcsrchr(enabled,L'\\');if(slash)lstrcpyW(slash+1,L"unlock-progression.enabled");GetModuleFileNameW(module,logPath,MAX_PATH);slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"unlock-progression.log");HANDLE t=CreateThread(nullptr,0,start,nullptr,0,nullptr);if(t)CloseHandle(t);}return TRUE;}
