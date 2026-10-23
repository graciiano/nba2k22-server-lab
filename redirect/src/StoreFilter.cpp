// StoreFilter: só a Swag's (loja 1) pede catálogo ao servidor; as outras lojas físicas não fazem requisição.
// Engenharia reversa (exe SHA-256 1727ad72...):
//  RVA 0x13BB170 = pedido de layout da loja (índice da tabela 14240CB10: 0 NBASTORE, 1 SWAGS, 2 FOOTLOCKER...)
//    -> grava o índice em 0x3E74998 e chama 13BB530 (serviço 0x8F8F3E0C); os itens (0xCD58A443) só vêm depois
//    que o layout chega. Sem resposta, o callback 13BB240 marca o status da loja = 3 ("vazia").
//  Status por loja: RVA 0x64AE8AC + índice * 0xB060 (3 = falhou/vazia).
// Para lojas != SWAGS a chamada original é pulada e o status vai direto para 3: a loja abre vazia e nada é
// enviado ao servidor. Arquivo opcional redirect\store-filter.txt: índices permitidos (padrão "1").
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
#include <wchar.h>
#include "MinHook.h"

static const uintptr_t RVA_REQUEST = 0x13bb170, RVA_STATUS = 0x64ae8ac, RVA_CURRENT = 0x3e74998, STATUS_STRIDE = 0xb060;
using RequestFn = void(__fastcall*)(int);
static RequestFn original;
static uintptr_t base;
static bool allowed[32] = {false, true};
static wchar_t dir[MAX_PATH], logPath[MAX_PATH];

static void logf(const char* fmt, ...) {
  FILE* f = _wfopen(logPath, L"ab"); if (!f) return;
  va_list a; va_start(a, fmt); vfprintf(f, fmt, a); va_end(a); fclose(f);
}
static void __fastcall hook(int store) {
  if (store >= 0 && store < 32 && !allowed[store]) {
    *(volatile int*)(base + RVA_CURRENT) = store;
    *(volatile int*)(base + RVA_STATUS + (uintptr_t)store * STATUS_STRIDE) = 3;
    logf("loja %d bloqueada (sem requisição)\n", store);
    return;
  }
  logf("loja %d liberada\n", store);
  original(store);
}
static DWORD start() {
  base = (uintptr_t)GetModuleHandleW(nullptr);
  const unsigned char expected[] = {0x40, 0x53, 0x48, 0x83, 0xec, 0x20, 0x8b, 0xd9, 0x89, 0x0d};
  if (memcmp((void*)(base + RVA_REQUEST), expected, sizeof(expected))) { logf("prologo inesperado\n"); return 2; }
  wchar_t cfg[MAX_PATH]; lstrcpyW(cfg, dir); lstrcatW(cfg, L"store-filter.txt");
  FILE* f = _wfopen(cfg, L"rb");
  if (f) { for (int i = 0; i < 32; i++) allowed[i] = false; int v; while (fscanf(f, "%d", &v) == 1) if (v >= 0 && v < 32) allowed[v] = true; fclose(f); }
  if (MH_Initialize() != MH_OK && MH_Initialize() != MH_ERROR_ALREADY_INITIALIZED) return 4;
  if (MH_CreateHook((void*)(base + RVA_REQUEST), (void*)hook, (void**)&original) != MH_OK) return 5;
  if (MH_EnableHook((void*)(base + RVA_REQUEST)) != MH_OK) return 6;
  logf("---- store-filter pronto pid=%lu\n", GetCurrentProcessId());
  return 0;
}
static DWORD WINAPI boot(LPVOID) { DWORD r = start(); if (r) logf("store-filter recusado %lu\n", r); return r; }
BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) {
    DisableThreadLibraryCalls(module);
    GetModuleFileNameW(module, dir, MAX_PATH); wchar_t* slash = wcsrchr(dir, L'\\'); if (slash) slash[1] = 0;
    lstrcpyW(logPath, dir); lstrcatW(logPath, L"store-filter.log");
    wchar_t exe[MAX_PATH]; GetModuleFileNameW(nullptr, exe, MAX_PATH);
    const wchar_t* name = wcsrchr(exe, L'\\'); name = name ? name + 1 : exe;
    if (lstrcmpiW(name, L"NBA2K22.exe") == 0) { HANDLE t = CreateThread(nullptr, 0, boot, nullptr, 0, nullptr); if (t) CloseHandle(t); }
  }
  return TRUE;
}
