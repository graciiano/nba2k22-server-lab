// ItemDbDump <saida.bin> : lê (somente leitura) a base de itens da loja do NBA2K22 em execução.
// Engenharia reversa: global RVA 0x63D59F0 = { HASHMAP* map; int count; }, lookup em 1413843B0:
//   map+0x18 buckets (ptr[]), map+0x20 máscara, map+0x24 nº de buckets; nó: [0] next, +8 chave, +0x10 valor, +0x18 chave.
// Saída: registros { u32 chave; u32 0; u64 endereço; u8 valor[0x200] }.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <tlhelp32.h>
#include <stdio.h>
#include <stdint.h>
#include <vector>
#include <algorithm>
static DWORD findGame() {
  HANDLE s = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0); PROCESSENTRY32W e; e.dwSize = sizeof(e); DWORD pid = 0;
  if (Process32FirstW(s, &e)) do { if (!lstrcmpiW(e.szExeFile, L"NBA2K22.exe")) { pid = e.th32ProcessID; break; } } while (Process32NextW(s, &e));
  CloseHandle(s); return pid;
}
static uintptr_t moduleBase(DWORD pid) {
  HANDLE s = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, pid); MODULEENTRY32W m; m.dwSize = sizeof(m); uintptr_t b = 0;
  if (Module32FirstW(s, &m)) do { if (!lstrcmpiW(m.szModule, L"NBA2K22.exe")) { b = (uintptr_t)m.modBaseAddr; break; } } while (Module32NextW(s, &m));
  CloseHandle(s); return b;
}
static HANDLE h;
template <class T> static bool rd(uintptr_t a, T& v) { SIZE_T n = 0; return ReadProcessMemory(h, (void*)a, &v, sizeof(T), &n) && n == sizeof(T); }
int main(int argc, char** argv) {
  if (argc < 2) { printf("uso: ItemDbDump <saida.bin> [rva_global=0x63D59F0] [tamanho=0x200]\n"); return 1; }
  uintptr_t rva = argc > 2 ? strtoull(argv[2], 0, 0) : 0x63D59F0; size_t vsize = argc > 3 ? strtoull(argv[3], 0, 0) : 0x200;
  DWORD pid = findGame(); if (!pid) { printf("jogo nao esta aberto\n"); return 2; }
  h = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, FALSE, pid); if (!h) { printf("sem acesso\n"); return 3; }
  uintptr_t base = moduleBase(pid); printf("base %llx\n", (unsigned long long)base);
  uintptr_t map = 0; int count = 0; rd(base + rva, map); rd(base + rva + 8, count);
  printf("map %llx count %d\n", (unsigned long long)map, count); if (!map) return 4;
  uintptr_t buckets = 0; int mask = 0, nb = 0; rd(map + 0x18, buckets); rd(map + 0x20, mask); rd(map + 0x24, nb);
  printf("buckets %llx mask %x n %d\n", (unsigned long long)buckets, mask, nb);
  FILE* f = fopen(argv[1], "wb"); if (!f) return 5;
  std::vector<unsigned char> val(vsize); int total = 0;
  for (int i = 0; i < nb && i < (1 << 24); i++) {
    uintptr_t node = 0; rd(buckets + 8ull * i, node);
    for (int guard = 0; node && guard < 100000; guard++) {
      uint32_t key = 0; uintptr_t v = 0, next = 0; rd(node + 0x18, key); rd(node + 0x10, v); rd(node, next);
      SIZE_T n = 0; std::fill(val.begin(), val.end(), 0); if (v) ReadProcessMemory(h, (void*)v, val.data(), vsize, &n);
      uint32_t zero = 0; fwrite(&key, 4, 1, f); fwrite(&zero, 4, 1, f); uint64_t a = v; fwrite(&a, 8, 1, f); fwrite(val.data(), 1, vsize, f);
      total++; node = next;
    }
  }
  fclose(f); printf("itens %d\n", total); CloseHandle(h); return 0;
}
