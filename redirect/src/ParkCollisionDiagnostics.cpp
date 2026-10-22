// ParkCollisionDiagnostics: lista os modelos de colisão do mundo (Park) e permite remover alguns para teste.
// Engenharia reversa (exe SHA-256 1727ad72...):
//  AI_SYSTEM_COL_2KWORLD::InitWithWorldDescription  RVA 0x193CA70 (this, worldDesc)
//    this+0x0E0  modelos de colisão (ponteiros, máx. 0x30)   this+0x260 quantidade
//    worldDesc+0x3420 qtd. de colisões fixas, +0x3428 ponteiros
//    worldDesc+0x6ED0 qtd. de atividades; registro 0xC0 a partir de +0x4B54 (crc nome), +0x4B58 nome (wchar)
//    para cada atividade: colisão de nível (recurso 0xBB05A9C1 / 0x10088372) e SpeedTree (0x65369839)
// Também grava worlddesc-N.bin (0x7000 bytes da descrição do mundo, inclui os COURT_DESCRIPTOR).
// Arquivo opcional redirect\collision-skip.txt: índices (decimal) a remover da lista depois do Init.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
#include <wchar.h>
#include "MinHook.h"

static const uintptr_t RVA_INIT = 0x193ca70;
using InitFn = void(__fastcall*)(void*, void*);
static InitFn original;
static uintptr_t base;
static wchar_t dir[MAX_PATH], logPath[MAX_PATH], skipPath[MAX_PATH];

static void logf(const char* fmt, ...) {
  FILE* f = _wfopen(logPath, L"ab"); if (!f) return;
  va_list a; va_start(a, fmt); vfprintf(f, fmt, a); va_end(a); fclose(f);
}
static void wname(const wchar_t* w, char* out, int n) {
  int i = 0; for (; i < n - 1 && w[i]; i++) out[i] = w[i] < 128 && w[i] >= 32 ? (char)w[i] : '?'; out[i] = 0;
}
static void __fastcall hook(void* self, void* desc) {
  char* s = (char*)self; char* d = (char*)desc;
  int fixed = *(int*)(d + 0x3420), acts = *(int*)(d + 0x6ed0);
  logf("---- collision init tick=%llu self=%p fixed=%d activities=%d\n", (unsigned long long)GetTickCount64(), self, fixed, acts);
  for (int i = 0; i < acts && i < 256; i++) {
    char n[128]; wname((const wchar_t*)(d + 0x4b58 + i * 0xc0), n, sizeof(n));
    logf("activity %d crc=%08x name=%s\n", i, *(unsigned*)(d + 0x4b54 + i * 0xc0), n);
  }
  { static int n = 0; wchar_t p[MAX_PATH]; swprintf(p, MAX_PATH, L"%lsworlddesc-%d.bin", dir, n++);
    FILE* b = _wfopen(p, L"wb"); if (b) { fwrite(desc, 1, 0x7000, b); fclose(b); logf("desc dump %ls\n", p); } }
  original(self, desc);
  int count = *(int*)(s + 0x260);
  void** models = (void**)(s + 0xe0);
  for (int i = 0; i < count; i++) logf("model %d %p first=%08x\n", i, models[i], models[i] ? *(unsigned*)models[i] : 0);
  FILE* f = _wfopen(skipPath, L"rb");
  if (f) {
    bool skip[0x30] = {}; int v;
    while (fscanf(f, "%d", &v) == 1) if (v >= 0 && v < 0x30) skip[v] = true;
    fclose(f);
    int j = 0;
    for (int i = 0; i < count; i++) if (!skip[i]) models[j++] = models[i]; else logf("model %d REMOVIDO\n", i);
    for (int i = j; i < count; i++) models[i] = nullptr;
    *(int*)(s + 0x260) = j;
    logf("models after skip=%d\n", j);
  }
}
static DWORD start() {
  base = (uintptr_t)GetModuleHandleW(nullptr);
  const unsigned char expected[] = {0x40,0x53,0x55,0x57,0x41,0x57,0x48,0x83,0xec,0x68};
  unsigned char first = *(unsigned char*)(base + RVA_INIT);
  if (first != 0xe9 && first != 0xeb && first != 0xff && memcmp((void*)(base + RVA_INIT), expected, sizeof(expected))) { logf("prologue byte %02x\n", first); return 2; }  // 0xE9: já hookado por outra cópia
  if (MH_Initialize() != MH_OK && MH_Initialize() != MH_ERROR_ALREADY_INITIALIZED) return 4;
  logf("park-collision prologue %02x\n", first);
  if (MH_CreateHook((void*)(base + RVA_INIT), (void*)hook, (void**)&original) != MH_OK) return 5;
  if (MH_EnableHook((void*)(base + RVA_INIT)) != MH_OK) return 6;
  logf("---- park-collision ready pid=%lu\n", GetCurrentProcessId());
  return 0;
}
static DWORD WINAPI boot(LPVOID) { DWORD r = start(); if (r) logf("park-collision refused %lu\n", r); return r; }
BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) {
    DisableThreadLibraryCalls(module);
    GetModuleFileNameW(module, dir, MAX_PATH); wchar_t* slash = wcsrchr(dir, L'\\'); if (slash) slash[1] = 0;
    lstrcpyW(logPath, dir); lstrcatW(logPath, L"park-collision.log");
    lstrcpyW(skipPath, dir); lstrcatW(skipPath, L"collision-skip.txt");
    wchar_t exe[MAX_PATH]; GetModuleFileNameW(nullptr, exe, MAX_PATH);
    const wchar_t* name = wcsrchr(exe, L'\\'); name = name ? name + 1 : exe;
    if (lstrcmpiW(name, L"NBA2K22.exe") == 0) { HANDLE t = CreateThread(nullptr, 0, boot, nullptr, 0, nullptr); if (t) CloseHandle(t); }
  }
  return TRUE;
}
