#include "LabTarget.h"
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>
#include <stdio.h>
int wmain(int argc,wchar_t** argv){if(argc!=2)return 1;DWORD pid=wcstoul(argv[1],nullptr,10);HANDLE process=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|PROCESS_CREATE_THREAD|PROCESS_VM_OPERATION|PROCESS_VM_WRITE|PROCESS_VM_READ,FALSE,pid);if(!process)return 2;
 wchar_t target[MAX_PATH];DWORD length=MAX_PATH;if(!QueryFullProcessImageNameW(process,0,target,&length)||lstrcmpiW(target,LabTargetPath())){CloseHandle(process);return 3;}
 wchar_t dll[MAX_PATH];GetModuleFileNameW(nullptr,dll,MAX_PATH);auto slash=wcsrchr(dll,L'\\');if(!slash)return 4;lstrcpyW(slash+1,L"ServiceErrorDiagnostics.dll");SIZE_T size=(wcslen(dll)+1)*sizeof(wchar_t),written=0;void* memory=VirtualAllocEx(process,nullptr,size,MEM_COMMIT|MEM_RESERVE,PAGE_READWRITE);if(!memory){CloseHandle(process);return 5;}
 bool ok=WriteProcessMemory(process,memory,dll,size,&written)&&written==size;HANDLE thread=nullptr;DWORD result=0;if(ok){thread=CreateRemoteThread(process,nullptr,0,(LPTHREAD_START_ROUTINE)GetProcAddress(GetModuleHandleW(L"kernel32.dll"),"LoadLibraryW"),memory,0,nullptr);ok=thread&&WaitForSingleObject(thread,10000)==WAIT_OBJECT_0&&GetExitCodeThread(thread,&result)&&result!=0;}
 if(thread)CloseHandle(thread);if(ok)VirtualFreeEx(process,memory,0,MEM_RELEASE);CloseHandle(process);if(!ok)return 6;printf("Load-state diagnostic attached to NBA2K22 PID %lu\n",pid);return 0;
}
