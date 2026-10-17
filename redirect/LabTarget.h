#pragma once
#include <windows.h>
inline const wchar_t* LabTargetPath(){static wchar_t value[MAX_PATH]={};if(!value[0])GetEnvironmentVariableW(L"NBA2K22_EXE",value,MAX_PATH);return value;}
