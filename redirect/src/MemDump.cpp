// MemDump <hex bytes> <antes> <tamanho> <saida> : procura um padrão na memória do NBA2K22 e grava a região.
// Uso de diagnóstico (somente leitura). Ex.: MemDump 60bc948a 0x4C34 0x7000 desc.bin
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <tlhelp32.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <vector>
static DWORD findGame() {
  HANDLE s = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0); PROCESSENTRY32W e; e.dwSize = sizeof(e); DWORD pid = 0;
  if (Process32FirstW(s, &e)) do { if (!lstrcmpiW(e.szExeFile, L"NBA2K22.exe")) { pid = e.th32ProcessID; break; } } while (Process32NextW(s, &e));
  CloseHandle(s); return pid;
}
int main(int argc, char** argv) {
  if (argc < 5) { printf("uso: MemDump <hex> <antes> <tamanho> <saida>\n"); return 1; }
  std::vector<unsigned char> pat; for (const char* p = argv[1]; p[0] && p[1]; p += 2) { char b[3] = {p[0], p[1], 0}; pat.push_back((unsigned char)strtoul(b, 0, 16)); }
  size_t before = strtoull(argv[2], 0, 0), size = strtoull(argv[3], 0, 0);
  HANDLE h = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, FALSE, findGame()); if (!h) { printf("sem processo\n"); return 2; }
  MEMORY_BASIC_INFORMATION mi; unsigned char* a = 0; int hits = 0; std::vector<unsigned char> buf;
  while (VirtualQueryEx(h, a, &mi, sizeof(mi))) {
    if (mi.State == MEM_COMMIT && (mi.Protect & (PAGE_READWRITE | PAGE_READONLY | PAGE_EXECUTE_READWRITE)) && !(mi.Protect & PAGE_GUARD) && mi.Type == MEM_PRIVATE) {
      buf.resize(mi.RegionSize); SIZE_T n = 0;
      if (ReadProcessMemory(h, mi.BaseAddress, buf.data(), mi.RegionSize, &n)) {
        for (size_t i = 0; i + pat.size() <= n; i += 4) if (!memcmp(&buf[i], pat.data(), pat.size())) {
          unsigned char* at = (unsigned char*)mi.BaseAddress + i; printf("hit %p\n", at);
          if (hits < 4) {
            std::vector<unsigned char> out(size); SIZE_T m = 0; ReadProcessMemory(h, at - before, out.data(), size, &m);
            char name[512]; snprintf(name, sizeof(name), "%s.%d", argv[4], hits); FILE* f = fopen(name, "wb"); if (f) { fwrite(out.data(), 1, m, f); fclose(f); }
            printf("  gravado %s (%zu bytes, base %p)\n", name, (size_t)m, at - before);
          }
          hits++;
        }
      }
    }
    a = (unsigned char*)mi.BaseAddress + mi.RegionSize;
  }
  printf("total %d\n", hits); CloseHandle(h); return 0;
}
