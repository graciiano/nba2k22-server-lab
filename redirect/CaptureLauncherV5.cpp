#include "LabTarget.h"
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
int wmain(int argc,wchar_t** argv){
 wchar_t self[MAX_PATH],dll[MAX_PATH],target[MAX_PATH],folder[MAX_PATH];
 GetModuleFileNameW(nullptr,self,MAX_PATH);wchar_t* slash=wcsrchr(self,L'\\');if(!slash)return 2;*slash=0;
 swprintf(dll,MAX_PATH,L"%ls\\SessionRedirect-v5.dll",self);
 const bool test=argc==2 && wcscmp(argv[1],L"--selftest")==0;
 if(test){swprintf(target,MAX_PATH,L"%ls\\redirect-selftest.exe",self);lstrcpyW(folder,self);}
 else{lstrcpyW(target,LabTargetPath());lstrcpyW(folder,target);auto s=wcsrchr(folder,L'\\');if(!s)return 2;*s=0;}
 if(GetFileAttributesW(dll)==INVALID_FILE_ATTRIBUTES || GetFileAttributesW(target)==INVALID_FILE_ATTRIBUTES){puts("Missing target or redirect DLL");return 3;}
 wchar_t command[2048];if(test)swprintf(command,2048,L"\"%ls\" \"%ls\"",target,dll);else swprintf(command,2048,L"\"%ls\"",target);
 STARTUPINFOW startup={};startup.cb=sizeof(startup);PROCESS_INFORMATION process={};
 if(!CreateProcessW(target,command,nullptr,nullptr,FALSE,CREATE_SUSPENDED,nullptr,folder,&startup,&process)){printf("CreateProcess failed: %lu\n",GetLastError());return 4;}
 const SIZE_T length=(wcslen(dll)+1)*sizeof(wchar_t);
 void* remote=VirtualAllocEx(process.hProcess,nullptr,length,MEM_RESERVE|MEM_COMMIT,PAGE_READWRITE);
 SIZE_T written=0;HANDLE thread=nullptr;DWORD result=0;
 bool ok=remote && WriteProcessMemory(process.hProcess,remote,dll,length,&written) && written==length;
 if(ok){auto load=(LPTHREAD_START_ROUTINE)GetProcAddress(GetModuleHandleW(L"kernel32.dll"),"LoadLibraryW");thread=CreateRemoteThread(process.hProcess,nullptr,0,load,remote,0,nullptr);ok=thread && WaitForSingleObject(thread,15000)==WAIT_OBJECT_0 && GetExitCodeThread(thread,&result) && result!=0;}
 if(thread)CloseHandle(thread);
 if(!ok){printf("Module loading failed: %lu. Closing only the newly created process.\n",GetLastError());TerminateProcess(process.hProcess,10);WaitForSingleObject(process.hProcess,5000);CloseHandle(process.hThread);CloseHandle(process.hProcess);return 5;}
 VirtualFreeEx(process.hProcess,remote,0,MEM_RELEASE);
 if(ResumeThread(process.hThread)==(DWORD)-1){puts("Resume failed");TerminateProcess(process.hProcess,11);CloseHandle(process.hThread);CloseHandle(process.hProcess);return 6;}
 printf("Redirect module loaded in new %s process (PID %lu).\n",test?"self-test":"NBA2K22",process.dwProcessId);
 CloseHandle(process.hThread);
 if(test){WaitForSingleObject(process.hProcess,15000);GetExitCodeProcess(process.hProcess,&result);CloseHandle(process.hProcess);return (int)result;}
 CloseHandle(process.hProcess);return 0;
}