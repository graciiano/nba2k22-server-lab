// AttachDll <nome.dll> : injeta uma DLL desta pasta no NBA2K22.exe em execução.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <tlhelp32.h>
#include <wchar.h>
#include <stdio.h>
static DWORD findGame() {
  HANDLE s = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0); PROCESSENTRY32W e; e.dwSize = sizeof(e); DWORD pid = 0;
  if (Process32FirstW(s, &e)) do { if (!lstrcmpiW(e.szExeFile, L"NBA2K22.exe")) { pid = e.th32ProcessID; break; } } while (Process32NextW(s, &e));
  CloseHandle(s); return pid;
}
int wmain(int argc, wchar_t** argv) {
  if (argc < 2) { printf("uso: AttachDll <dll> [pid]\n"); return 1; }
  DWORD pid = argc > 2 ? wcstoul(argv[2], nullptr, 10) : findGame();
  if (!pid) { printf("NBA2K22.exe nao esta aberto\n"); return 2; }
  wchar_t dll[MAX_PATH]; GetModuleFileNameW(nullptr, dll, MAX_PATH); wchar_t* slash = wcsrchr(dll, L'\\'); lstrcpyW(slash + 1, argv[1]);
  if (GetFileAttributesW(dll) == INVALID_FILE_ATTRIBUTES) { printf("DLL nao encontrada\n"); return 3; }
  HANDLE p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_CREATE_THREAD | PROCESS_VM_OPERATION | PROCESS_VM_WRITE | PROCESS_VM_READ, FALSE, pid);
  if (!p) { printf("OpenProcess falhou %lu\n", GetLastError()); return 4; }
  SIZE_T size = (wcslen(dll) + 1) * 2, w = 0; void* mem = VirtualAllocEx(p, nullptr, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
  DWORD code = 0; HANDLE t = nullptr;
  bool ok = mem && WriteProcessMemory(p, mem, dll, size, &w) && w == size;
  if (ok) { t = CreateRemoteThread(p, nullptr, 0, (LPTHREAD_START_ROUTINE)GetProcAddress(GetModuleHandleW(L"kernel32.dll"), "LoadLibraryW"), mem, 0, nullptr); ok = t && WaitForSingleObject(t, 15000) == WAIT_OBJECT_0 && GetExitCodeThread(t, &code) && code; }
  if (t) CloseHandle(t); if (mem) VirtualFreeEx(p, mem, 0, MEM_RELEASE); CloseHandle(p);
  if (!ok) { printf("injecao falhou\n"); return 5; }
  wprintf(L"%ls anexada ao NBA2K22 PID %lu\n", argv[1], pid); return 0;
}
