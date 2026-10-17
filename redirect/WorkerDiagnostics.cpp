#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winhttp.h>
#include <stdint.h>
#include <wchar.h>
#include <stdio.h>
#include <string.h>
#include "MinHook.h"
static SRWLOCK guard=SRWLOCK_INIT;
static HINTERNET connections[256]={},requests[256]={};
static LONG hookCount=0;
static wchar_t logPath[MAX_PATH]={};
using ConnectFn=HINTERNET(WINAPI*)(HINTERNET,LPCWSTR,INTERNET_PORT,DWORD);
using OpenFn=HINTERNET(WINAPI*)(HINTERNET,LPCWSTR,LPCWSTR,LPCWSTR,LPCWSTR,LPCWSTR const*,DWORD);
using SendFn=BOOL(WINAPI*)(HINTERNET,LPCWSTR,DWORD,LPVOID,DWORD,DWORD,DWORD_PTR);
using CloseFn=BOOL(WINAPI*)(HINTERNET);
static ConnectFn originalConnect;static OpenFn originalOpen;static SendFn originalSend;static CloseFn originalClose;
using ReceiveFn=BOOL(WINAPI*)(HINTERNET,LPVOID);using ReadFn=BOOL(WINAPI*)(HINTERNET,LPVOID,DWORD,LPDWORD);
static ReceiveFn originalReceive;static ReadFn originalRead;
static bool contains(HINTERNET* set,HINTERNET h){bool result=false;AcquireSRWLockShared(&guard);for(int i=0;i<256;i++)if(set[i]==h && h){result=true;break;}ReleaseSRWLockShared(&guard);return result;}
static void add(HINTERNET* set,HINTERNET h){if(!h)return;AcquireSRWLockExclusive(&guard);for(int i=0;i<256;i++)if(!set[i]){set[i]=h;break;}ReleaseSRWLockExclusive(&guard);}
static void erase(HINTERNET h){AcquireSRWLockExclusive(&guard);for(int i=0;i<256;i++){if(connections[i]==h)connections[i]=nullptr;if(requests[i]==h)requests[i]=nullptr;}ReleaseSRWLockExclusive(&guard);}
static void log(const char* text){DWORD saved=GetLastError();HANDLE file=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(file!=INVALID_HANDLE_VALUE){DWORD written;WriteFile(file,text,(DWORD)lstrlenA(text),&written,nullptr);CloseHandle(file);}SetLastError(saved);}
static HINTERNET WINAPI connectHook(HINTERNET session,LPCWSTR host,INTERNET_PORT port,DWORD flags){
 char hostText[512]={};if(host)WideCharToMultiByte(CP_UTF8,0,host,-1,hostText,sizeof(hostText),nullptr,nullptr);char line[700];snprintf(line,sizeof(line),"connect pid=%lu host=%s port=%u\r\n",GetCurrentProcessId(),hostText,(unsigned)port);log(line);
 bool redirect=host && lstrcmpiW(host,L"nba2k22-ws.2ksports.com")==0 && port==22004;
 HINTERNET result=originalConnect(session,redirect?L"127.0.0.1":host,redirect?21022:port,flags);
 if(redirect && result){add(connections,result);log("session endpoint -> https://127.0.0.1:21022\r\n");}return result;
}
static HINTERNET WINAPI openHook(HINTERNET connection,LPCWSTR verb,LPCWSTR object,LPCWSTR version,LPCWSTR referrer,LPCWSTR const* accept,DWORD flags){
 char method[32]={};if(verb)WideCharToMultiByte(CP_UTF8,0,verb,-1,method,sizeof(method),nullptr,nullptr);char line[160];snprintf(line,sizeof(line),"open pid=%lu method=%s redirected=%d\r\n",GetCurrentProcessId(),method,contains(connections,connection)?1:0);log(line);
 HINTERNET result=originalOpen(connection,verb,object,version,referrer,accept,flags);
 if(contains(connections,connection) && result)add(requests,result);return result;
}
static BOOL WINAPI sendHook(HINTERNET request,LPCWSTR headers,DWORD headerLength,LPVOID data,DWORD size,DWORD total,DWORD_PTR context){
 if(contains(requests,request)){
 DWORD security=SECURITY_FLAG_IGNORE_UNKNOWN_CA|SECURITY_FLAG_IGNORE_CERT_CN_INVALID|SECURITY_FLAG_IGNORE_CERT_DATE_INVALID|SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
 if(!WinHttpSetOption(request,WINHTTP_OPTION_SECURITY_FLAGS,&security,sizeof(security))){log("local TLS option failed\r\n");return FALSE;}
 log("sending redirected session request\r\n");
 }BOOL ok=originalSend(request,headers,headerLength,data,size,total,context);DWORD error=GetLastError();char line[180];snprintf(line,sizeof(line),"send pid=%lu redirected=%d ok=%d error=%lu bytes=%lu\r\n",GetCurrentProcessId(),contains(requests,request)?1:0,ok?1:0,ok?0:error,size);log(line);SetLastError(error);return ok;
}
static BOOL WINAPI receiveHook(HINTERNET request,LPVOID reserved){
 BOOL ok=originalReceive(request,reserved);DWORD error=GetLastError();DWORD status=0,size=sizeof(status);
 if(ok)WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&size,WINHTTP_NO_HEADER_INDEX);
 char line[180];snprintf(line,sizeof(line),"receive pid=%lu redirected=%d ok=%d error=%lu status=%lu\r\n",GetCurrentProcessId(),contains(requests,request)?1:0,ok?1:0,ok?0:error,status);log(line);SetLastError(error);return ok;
}
static BOOL WINAPI readHook(HINTERNET request,LPVOID buffer,DWORD length,LPDWORD read){
 BOOL ok=originalRead(request,buffer,length,read);DWORD error=GetLastError();char line[180];snprintf(line,sizeof(line),"read pid=%lu redirected=%d ok=%d error=%lu bytes=%lu\r\n",GetCurrentProcessId(),contains(requests,request)?1:0,ok?1:0,ok?0:error,ok&&read?*read:0);log(line);SetLastError(error);return ok;
}
static BOOL WINAPI closeHook(HINTERNET handle){erase(handle);return originalClose(handle);}
static bool patch(void** slot,void* replacement,void** original){DWORD protection;if(!VirtualProtect(slot,sizeof(void*),PAGE_READWRITE,&protection))return false;*original=*slot;InterlockedExchangePointer(slot,replacement);DWORD ignored;VirtualProtect(slot,sizeof(void*),protection,&ignored);FlushInstructionCache(GetCurrentProcess(),slot,sizeof(void*));return true;}
static void install(){
 auto base=(unsigned char*)GetModuleHandleW(nullptr);auto dos=(IMAGE_DOS_HEADER*)base;if(dos->e_magic!=IMAGE_DOS_SIGNATURE)return;
 auto nt=(IMAGE_NT_HEADERS64*)(base+dos->e_lfanew);if(nt->Signature!=IMAGE_NT_SIGNATURE)return;
 auto directory=nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];if(!directory.VirtualAddress)return;
 auto descriptor=(IMAGE_IMPORT_DESCRIPTOR*)(base+directory.VirtualAddress);
 for(;descriptor->Name;descriptor++){
 if(lstrcmpiA((char*)(base+descriptor->Name),"winhttp.dll")!=0 || !descriptor->OriginalFirstThunk)continue;
 auto names=(IMAGE_THUNK_DATA64*)(base+descriptor->OriginalFirstThunk);auto slots=(IMAGE_THUNK_DATA64*)(base+descriptor->FirstThunk);
 for(;names->u1.AddressOfData;names++,slots++){
 if(IMAGE_SNAP_BY_ORDINAL64(names->u1.Ordinal))continue;
 auto import=(IMAGE_IMPORT_BY_NAME*)(base+names->u1.AddressOfData);const char* name=(char*)import->Name;
 bool ok=false;
 if(lstrcmpA(name,"WinHttpConnect")==0)ok=patch((void**)&slots->u1.Function,(void*)connectHook,(void**)&originalConnect);
 else if(lstrcmpA(name,"WinHttpOpenRequest")==0)ok=patch((void**)&slots->u1.Function,(void*)openHook,(void**)&originalOpen);
 else if(lstrcmpA(name,"WinHttpSendRequest")==0)ok=patch((void**)&slots->u1.Function,(void*)sendHook,(void**)&originalSend);
 else if(lstrcmpA(name,"WinHttpCloseHandle")==0)ok=patch((void**)&slots->u1.Function,(void*)closeHook,(void**)&originalClose);
 else if(lstrcmpA(name,"WinHttpReceiveResponse")==0)ok=patch((void**)&slots->u1.Function,(void*)receiveHook,(void**)&originalReceive);
 else if(lstrcmpA(name,"WinHttpReadData")==0)ok=patch((void**)&slots->u1.Function,(void*)readHook,(void**)&originalRead);
 if(ok)InterlockedIncrement(&hookCount);
 }
 }
}

using WorldLoadFn=__int64(__fastcall*)(void*);
static WorldLoadFn originalWorldLoad=nullptr;
static __int64 __fastcall worldLoadHook(void* root){
 auto mainBase=(uintptr_t)GetModuleHandleW(nullptr);auto nt=(IMAGE_NT_HEADERS64*)(mainBase+((IMAGE_DOS_HEADER*)mainBase)->e_lfanew);
 void* object=root?((void**)root)[14]:nullptr;uintptr_t target=0;
 if(object){auto table=*(uintptr_t**)object;if(table)target=table[13];}
 const bool inMain=target>=mainBase && target<mainBase+nt->OptionalHeader.SizeOfImage;
 char line[240];snprintf(line,sizeof(line),"world-load pid=%lu target_in_main=%d target_rva=0x%llx\r\n",GetCurrentProcessId(),inMain?1:0,(unsigned long long)(inMain?target-mainBase:0));log(line);
 return originalWorldLoad(root);
}

using CreateConnectionFn=DWORD*(__fastcall*)(void*,DWORD*,void*,void*,void*);
using UserLookupFn=DWORD*(__fastcall*)(void*,DWORD*,unsigned long long,void*);
static CreateConnectionFn originalCreateConnection=nullptr;
static UserLookupFn originalUserLookup=nullptr;
static thread_local int connectionTraceDepth=0;
static DWORD* __fastcall userLookupHook(void* self,DWORD* status,unsigned long long user,void* output){
 DWORD* result=originalUserLookup(self,status,user,output);DWORD error=GetLastError();
 if(connectionTraceDepth){char line[160];snprintf(line,sizeof(line),"world-user-lookup pid=%lu user_zero=%d status=0x%08lx\r\n",GetCurrentProcessId(),user==0?1:0,status?*status:0);log(line);}SetLastError(error);return result;
}
static DWORD* __fastcall createConnectionHook(void* self,DWORD* status,void* allocator,void* state,void* fields){
 ++connectionTraceDepth;DWORD* result=originalCreateConnection(self,status,allocator,state,fields);DWORD error=GetLastError();--connectionTraceDepth;
 char line[160];snprintf(line,sizeof(line),"world-create-connection pid=%lu status=0x%08lx\r\n",GetCurrentProcessId(),status?*status:0);log(line);SetLastError(error);return result;
}


using WorkerFn=DWORD*(__fastcall*)(void*,DWORD*);
using StatusFn=DWORD*(__fastcall*)(void*,DWORD*,DWORD);
static WorkerFn originalWorker=nullptr;
static StatusFn originalStatus=nullptr;
static DWORD* __fastcall workerHook(void* self,DWORD* status){
 char line[160];snprintf(line,sizeof(line),"world-worker-enter pid=%lu\r\n",GetCurrentProcessId());log(line);
 DWORD* result=originalWorker(self,status);DWORD error=GetLastError();
 snprintf(line,sizeof(line),"world-worker-exit pid=%lu status=0x%08lx\r\n",GetCurrentProcessId(),status?*status:0);log(line);SetLastError(error);return result;
}
static DWORD* __fastcall statusHook(void* self,DWORD* output,DWORD status){
 DWORD* result=originalStatus(self,output,status);DWORD error=GetLastError();char line[180];
 snprintf(line,sizeof(line),"world-status-transition pid=%lu input=0x%08lx output=0x%08lx\r\n",GetCurrentProcessId(),status,output?*output:0);log(line);SetLastError(error);return result;
}

static DWORD WINAPI installWorldTrace(LPVOID){
 wchar_t name[MAX_PATH];GetModuleFileNameW(nullptr,name,MAX_PATH);wchar_t* last=wcsrchr(name,L'\\');last=last?last+1:name;
 void* target=nullptr;
 if(lstrcmpiW(last,L"NBA2K22.exe")==0){
  target=(unsigned char*)GetModuleHandleW(nullptr)+0x1620360;
  const unsigned char expected[]={0x40,0x55,0x53,0x41,0x57,0x48,0x8d,0xac,0x24,0x50,0xfa,0xff,0xff,0x48,0x81,0xec};
  if(memcmp(target,expected,sizeof(expected))!=0){log("world-trace refused: prologue mismatch\r\n");return 1;}
 }else if(lstrcmpiW(last,L"redirect-selftest.exe")==0)target=(void*)GetProcAddress(GetModuleHandleW(nullptr),"WorldLoadFixture");
 if(!target)return 2;
 MH_STATUS status=MH_Initialize();if(status!=MH_OK){log("world-trace initialize failed\r\n");return 3;}
 status=MH_CreateHook(target,(void*)worldLoadHook,(void**)&originalWorldLoad);
 if(status==MH_OK){
 void* createTarget=nullptr;void* lookupTarget=nullptr;
 if(lstrcmpiW(last,L"NBA2K22.exe")==0){
  auto base=(unsigned char*)GetModuleHandleW(nullptr);createTarget=base+0x2088820;lookupTarget=base+0x208ed00;
  const unsigned char createBytes[]={0x40,0x55,0x56,0x57,0x48,0x8d,0xac,0x24,0x80,0xeb,0xff,0xff,0xb8,0x80,0x15,0x0},lookupBytes[]={0x48,0x89,0x5c,0x24,0x10,0x48,0x89,0x6c,0x24,0x18,0x56,0x57,0x41,0x56,0x48,0x83};
  if(memcmp(createTarget,createBytes,16)||memcmp(lookupTarget,lookupBytes,16)){log("world-status refused: prologue mismatch\r\n");MH_Uninitialize();return 5;}
 }else{createTarget=(void*)GetProcAddress(GetModuleHandleW(nullptr),"CreateConnectionFixture");lookupTarget=(void*)GetProcAddress(GetModuleHandleW(nullptr),"UserLookupFixture");}
 if(!createTarget||!lookupTarget){MH_Uninitialize();return 6;}
 status=MH_CreateHook(createTarget,(void*)createConnectionHook,(void**)&originalCreateConnection);
 if(status==MH_OK)status=MH_CreateHook(lookupTarget,(void*)userLookupHook,(void**)&originalUserLookup);
 
 if(status==MH_OK){
 void* worker=nullptr;void* transition=nullptr;
 if(lstrcmpiW(last,L"NBA2K22.exe")==0){auto base=(unsigned char*)GetModuleHandleW(nullptr);worker=base+0x208a210;transition=base+0x20897f0;
 const unsigned char w[]={72,137,84,36,16,85,83,86,87,65,85,65,86,65,87,72},t[]={72,137,92,36,8,72,137,108,36,16,72,137,116,36,24,87};
 if(memcmp(worker,w,16)||memcmp(transition,t,16)){MH_Uninitialize();log("world-worker refused: prologue mismatch\r\n");return 7;}
 }else{worker=(void*)GetProcAddress(GetModuleHandleW(nullptr),"WorkerFixture");transition=(void*)GetProcAddress(GetModuleHandleW(nullptr),"StatusFixture");}
 if(!worker||!transition){MH_Uninitialize();return 8;}
 status=MH_CreateHook(worker,(void*)workerHook,(void**)&originalWorker);
 if(status==MH_OK)status=MH_CreateHook(transition,(void*)statusHook,(void**)&originalStatus);
 }
 if(status==MH_OK)status=MH_EnableHook(MH_ALL_HOOKS);
}
 if(status!=MH_OK){log("world-trace install failed\r\n");return 4;}
 char line[100];snprintf(line,sizeof(line),"world-trace pid=%lu ready\r\n",GetCurrentProcessId());log(line);return 0;
}
extern "C" __declspec(dllexport) DWORD StartWorldTrace(){return installWorldTrace(nullptr);}

extern "C" __declspec(dllexport) LONG GetRedirectHookCount(){return hookCount;}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){
 DisableThreadLibraryCalls(module);GetModuleFileNameW(module,logPath,MAX_PATH);wchar_t* slash=wcsrchr(logPath,L'\\');if(slash)lstrcpyW(slash+1,L"redirect.log");
 wchar_t process[MAX_PATH];GetModuleFileNameW(nullptr,process,MAX_PATH);wchar_t* name=wcsrchr(process,L'\\');name=name?name+1:process;
 if(lstrcmpiW(name,L"NBA2K22.exe")==0 || lstrcmpiW(name,L"redirect-selftest.exe")==0){install();if(lstrcmpiW(name,L"NBA2K22.exe")==0){HANDLE thread=CreateThread(nullptr,0,installWorldTrace,nullptr,0,nullptr);if(thread)CloseHandle(thread);}}
 }return TRUE;}