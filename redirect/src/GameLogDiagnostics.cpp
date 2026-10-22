// GameLogDiagnostics: liga o log interno do NBA2K22 e grava em redirect\game-log.txt.
// Engenharia reversa (exe SHA-256 1727ad72...):
//  - RVA 0x1E645B0 = logger(file, func, line, channel, fmtW, args)  (usado por ~3000 chamadas)
//  - RVA 0x4B5B4BC = flag global "debug log" (setting 0x6157C6DA, escrito em 0x1E6469C e 0xC59ACD);
//    quase todas as chamadas fazem "cmp [flag],0 / je pula" antes do logger.
//  - args: { u32 ?, u32 count, { void* value, void* formatter } [count] }
// Cada formato distinto é gravado no máximo MAX_PER_FMT vezes para não pesar.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
#include <wchar.h>
#include "MinHook.h"

static const uintptr_t RVA_LOGGER = 0x1e645b0, RVA_FLAG = 0x4b5b4bc;
static const int MAX_PER_FMT = 40;
using LogFn = void(__fastcall*)(const char*, const char*, int, const char*, const wchar_t*, void*, void*, void*);
static LogFn original;
static uintptr_t base;
static wchar_t logPath[MAX_PATH];
static CRITICAL_SECTION lock;
static FILE* out;
struct Seen { const void* fmt; int count; };
static Seen seen[16384];

static bool readable(const void* p, size_t n) {
  MEMORY_BASIC_INFORMATION mi;
  if (!p || !VirtualQuery(p, &mi, sizeof(mi)) || mi.State != MEM_COMMIT) return false;
  if (mi.Protect & (PAGE_NOACCESS | PAGE_GUARD)) return false;
  return (uintptr_t)p + n <= (uintptr_t)mi.BaseAddress + mi.RegionSize;
}
static int bump(const void* fmt) {
  size_t h = ((uintptr_t)fmt >> 1) & 16383;
  for (int i = 0; i < 16384; i++, h = (h + 1) & 16383) {
    if (seen[h].fmt == fmt) return ++seen[h].count;
    if (!seen[h].fmt) { seen[h].fmt = fmt; seen[h].count = 1; return 1; }
  }
  return 1 << 30;
}
static void putWide(const wchar_t* w, int max) {
  for (int i = 0; i < max && readable(w + i, 2) && w[i]; i++) { wchar_t c = w[i]; fputc(c == L'\n' || c == L'\r' ? ' ' : (c < 128 ? (char)c : '?'), out); }
}
static void putArg(void* value, void* formatter) {
  fprintf(out, " {f=%llx", (unsigned long long)((uintptr_t)formatter - base));
  if (readable(value, 8)) {
    unsigned long long v = *(unsigned long long*)value;
    fprintf(out, " u32=%08lx u64=%llx", (unsigned long)(v & 0xffffffff), v);
    float f; memcpy(&f, value, 4); if (f == f && f > -1e7f && f < 1e7f && (v & 0xffffffff)) fprintf(out, " f=%g", f);
    void* p = (void*)v;
    if (readable(p, 4)) {
      const wchar_t* w = (const wchar_t*)p; const char* a = (const char*)p;
      if (w[0] >= 32 && w[0] < 127 && readable(p, 4) && w[1] >= 32 && w[1] < 127) { fputs(" w=\"", out); putWide(w, 120); fputc('"', out); }
      else if (a[0] >= 32 && a[0] < 127 && a[1] >= 32 && a[1] < 127) { fputs(" s=\"", out); for (int i = 0; i < 120 && readable(a + i, 1) && a[i] >= 32 && a[i] < 127; i++) fputc(a[i], out); fputc('"', out); }
    }
    const wchar_t* w2 = (const wchar_t*)value;  // string stored inline
    if (w2[0] >= 32 && w2[0] < 127 && w2[1] >= 32 && w2[1] < 127) { fputs(" iw=\"", out); putWide(w2, 120); fputc('"', out); }
  }
  fputc('}', out);
}
static void __fastcall hook(const char* file, const char* func, int line, const char* channel, const wchar_t* fmt, void* args, void* a7, void* a8) {
  DWORD err = GetLastError();
  uintptr_t caller = (uintptr_t)__builtin_return_address(0) - base;
  EnterCriticalSection(&lock);
  if (out && bump(fmt) <= MAX_PER_FMT) {
    fprintf(out, "%llu c=%llx [%s] %s:%d ", (unsigned long long)GetTickCount64(), (unsigned long long)caller, readable(channel, 1) ? channel : "?", readable(func, 1) ? func : "?", line);
    if (readable(fmt, 2)) putWide(fmt, 400);
    if (readable(args, 8)) {
      unsigned count = ((unsigned*)args)[1];
      if (count > 8) count = 8;
      void** pairs = (void**)((char*)args + 8);
      for (unsigned i = 0; i < count && readable(pairs + 2 * i, 16); i++) putArg(pairs[2 * i], pairs[2 * i + 1]);
    }
    fputc('\n', out);
  }
  LeaveCriticalSection(&lock);
  SetLastError(err);
  original(file, func, line, channel, fmt, args, a7, a8);
}
static DWORD WINAPI flusher(LPVOID) {
  for (;;) {
    Sleep(1000);
    EnterCriticalSection(&lock); if (out) fflush(out); LeaveCriticalSection(&lock);
    // o jogo pode religar/desligar o flag ao trocar configurações; mantém ligado
    *(volatile DWORD*)(base + RVA_FLAG) = 1;
  }
}
static DWORD start() {
  base = (uintptr_t)GetModuleHandleW(nullptr);
  const unsigned char expected[] = {0x48,0x89,0x5c,0x24,0x08,0x48,0x89,0x6c,0x24,0x10,0x48,0x89,0x74,0x24,0x18,0x48};
  if (memcmp((void*)(base + RVA_LOGGER), expected, sizeof(expected))) return 2;
  out = _wfopen(logPath, L"ab");
  if (!out) return 3;
  setvbuf(out, nullptr, _IOFBF, 1 << 20);
  fprintf(out, "---- game-log pid=%lu tick=%llu\n", GetCurrentProcessId(), (unsigned long long)GetTickCount64());
  if (MH_Initialize() != MH_OK) return 4;
  if (MH_CreateHook((void*)(base + RVA_LOGGER), (void*)hook, (void**)&original) != MH_OK) return 5;
  if (MH_EnableHook((void*)(base + RVA_LOGGER)) != MH_OK) return 6;
  *(volatile DWORD*)(base + RVA_FLAG) = 1;
  HANDLE t = CreateThread(nullptr, 0, flusher, nullptr, 0, nullptr); if (t) CloseHandle(t);
  return 0;
}
static DWORD WINAPI boot(LPVOID) {
  DWORD r = start();
  if (r) { FILE* f = _wfopen(logPath, L"ab"); if (f) { fprintf(f, "game-log refused %lu\n", r); fclose(f); } }
  return r;
}
BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) {
    DisableThreadLibraryCalls(module);
    InitializeCriticalSection(&lock);
    GetModuleFileNameW(module, logPath, MAX_PATH);
    wchar_t* slash = wcsrchr(logPath, L'\\'); if (slash) lstrcpyW(slash + 1, L"game-log.txt");
    wchar_t exe[MAX_PATH]; GetModuleFileNameW(nullptr, exe, MAX_PATH);
    const wchar_t* name = wcsrchr(exe, L'\\'); name = name ? name + 1 : exe;
    if (lstrcmpiW(name, L"NBA2K22.exe") == 0) { HANDLE t = CreateThread(nullptr, 0, boot, nullptr, 0, nullptr); if (t) CloseHandle(t); }
  }
  return TRUE;
}
