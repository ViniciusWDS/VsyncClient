Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
Var UpdateMode
Var ParentPid
Name "Vsync Client"
!ifndef APP_VERSION
!define APP_VERSION "0.1.2"
!endif
!ifndef OUTPUT_FILE
!define OUTPUT_FILE "Vsync-Client-Setup-${APP_VERSION}.exe"
!endif
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Vsync Client"
InstallDirRegKey HKCU "Software\VsyncClient" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID zlib
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=1046 "ProductName" "Vsync Client"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador Vsync Client"
VIAddVersionKey /LANG=1046 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1046 "LegalCopyright" "Vsync 2026"
!define MUI_ABORTWARNING
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Vsync Client.exe"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirectoryLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"
Function .onInit
 StrCpy $UpdateMode "0"
 ${GetParameters} $R0
 ClearErrors
 ${GetOptions} $R0 "/UPDATE" $R1
 ${IfNot} ${Errors}
  StrCpy $UpdateMode "1"
  ClearErrors
  ${GetOptions} $R0 "/PID=" $ParentPid
  ${If} ${Errors}
   SetErrorLevel 2
   Quit
  ${EndIf}
  IntCmp $ParentPid 1 0 invalid_parent wait_parent
  invalid_parent:
   SetErrorLevel 2
   Quit
  wait_parent:
  ; Aguarde o processo principal liberar EXE/ASAR antes de substituir arquivos.
  System::Call 'kernel32::OpenProcess(i 0x00100000, i 0, i $ParentPid) p .r0'
  ${If} $0 != 0
   System::Call 'kernel32::WaitForSingleObject(p r0, i 60000) i .r1'
   System::Call 'kernel32::CloseHandle(p r0)'
   ${If} $1 != 0
    SetErrorLevel 2
    Quit
   ${EndIf}
  ${Else}
   ; ERROR_INVALID_PARAMETER significa que o processo já encerrou.
   System::Call 'kernel32::GetLastError() i .r1'
   ${If} $1 != 87
    SetErrorLevel 2
    Quit
   ${EndIf}
  ${EndIf}
 ${EndIf}
 ${IfNot} ${RunningX64}
  MessageBox MB_ICONSTOP|MB_OK "Vsync Client requer Windows 64 bits." /SD IDOK
  SetErrorLevel 2
  Quit
 ${EndIf}
 ${IfNot} ${AtLeastWin10}
  MessageBox MB_ICONSTOP|MB_OK "Vsync Client requer Windows 10 ou superior (64 bits)." /SD IDOK
  SetErrorLevel 2
  Quit
 ${EndIf}
 FindWindow $0 "Chrome_WidgetWin_1" "Vsync Client"
 ${If} $0 != 0
  MessageBox MB_ICONEXCLAMATION|MB_OK "Feche o Vsync Client antes de instalar uma atualização." /SD IDOK
  SetErrorLevel 2
  Quit
 ${EndIf}
FunctionEnd
Function .onInstSuccess
 ${If} $UpdateMode == "1"
  Exec '"$INSTDIR\Vsync Client.exe"'
 ${EndIf}
FunctionEnd
Function DirectoryLeave
 IfFileExists "$INSTDIR\Vsync Client.exe" directory_ok 0
 FindFirst $1 $2 "$INSTDIR\*"
 IfErrors directory_ok
 directory_loop:
 StrCmp $2 "" directory_done
 StrCmp $2 "." directory_next
 StrCmp $2 ".." directory_next
 FindClose $1
 MessageBox MB_ICONEXCLAMATION|MB_OK "Escolha uma pasta vazia ou a pasta de uma instalação existente do Vsync Client." /SD IDOK
 SetErrorLevel 2
 Abort
 directory_next:
 FindNext $1 $2
 IfErrors directory_done
 Goto directory_loop
 directory_done:
 FindClose $1
 directory_ok:
FunctionEnd
Section "Vsync Client"
 Call DirectoryLeave
 SetShellVarContext current
 SetOutPath "$INSTDIR"
 File /r /x ".*" "${APP_DIR}\*"
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 CreateDirectory "$SMPROGRAMS\Vsync Client"
 CreateShortcut "$SMPROGRAMS\Vsync Client\Vsync Client.lnk" "$INSTDIR\Vsync Client.exe"
 CreateShortcut "$SMPROGRAMS\Vsync Client\Desinstalar.lnk" "$INSTDIR\Uninstall.exe"
 CreateShortcut "$DESKTOP\Vsync Client.lnk" "$INSTDIR\Vsync Client.exe"
 WriteRegStr HKCU "Software\VsyncClient" "InstallDir" "$INSTDIR"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VsyncClient" "DisplayName" "Vsync Client"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VsyncClient" "DisplayVersion" "${APP_VERSION}"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VsyncClient" "Publisher" "Vsync"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VsyncClient" "UninstallString" '"$INSTDIR\Uninstall.exe"'
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VsyncClient" "DisplayIcon" "$INSTDIR\Vsync Client.exe"
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VsyncClient" "NoModify" 1
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VsyncClient" "NoRepair" 1
SectionEnd
Section "Uninstall"
 SetShellVarContext current
 !include "uninstall-files.nsh"
 Delete "$INSTDIR\Uninstall.exe"
 RMDir "$INSTDIR"
 Delete "$DESKTOP\Vsync Client.lnk"
 Delete "$SMPROGRAMS\Vsync Client\Vsync Client.lnk"
 Delete "$SMPROGRAMS\Vsync Client\Desinstalar.lnk"
 RMDir "$SMPROGRAMS\Vsync Client"
 DeleteRegKey HKCU "Software\VsyncClient"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VsyncClient"
 MessageBox MB_OK "Vsync Client removido. Seus perfis e mundos em AppData foram preservados." /SD IDOK
SectionEnd
