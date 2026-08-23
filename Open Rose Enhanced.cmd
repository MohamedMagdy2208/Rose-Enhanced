@echo off
setlocal

set "ROSE_ENHANCED_ROOT=%~dp0"
set "ROSE_ENHANCED_EXE="

rem Prefer an installed release, then a package built from this repository.
if exist "%LOCALAPPDATA%\rose_enhanced\Rose Enhanced.exe" set "ROSE_ENHANCED_EXE=%LOCALAPPDATA%\rose_enhanced\Rose Enhanced.exe"
if not defined ROSE_ENHANCED_EXE if exist "%LOCALAPPDATA%\Programs\Rose Enhanced\Rose Enhanced.exe" set "ROSE_ENHANCED_EXE=%LOCALAPPDATA%\Programs\Rose Enhanced\Rose Enhanced.exe"
if not defined ROSE_ENHANCED_EXE if exist "%ROSE_ENHANCED_ROOT%apps\desktop\out\@rose-enhanced-desktop-win32-x64\Rose Enhanced.exe" set "ROSE_ENHANCED_EXE=%ROSE_ENHANCED_ROOT%apps\desktop\out\@rose-enhanced-desktop-win32-x64\Rose Enhanced.exe"
if not defined ROSE_ENHANCED_EXE if exist "%ROSE_ENHANCED_ROOT%apps\desktop\out\Rose Enhanced-win32-x64\Rose Enhanced.exe" set "ROSE_ENHANCED_EXE=%ROSE_ENHANCED_ROOT%apps\desktop\out\Rose Enhanced-win32-x64\Rose Enhanced.exe"

if defined ROSE_ENHANCED_EXE (
  start "" "%ROSE_ENHANCED_EXE%"
  exit /b 0
)

rem A source checkout can still be opened after its dependencies are installed.
if exist "%ROSE_ENHANCED_ROOT%node_modules" (
  where npm >nul 2>&1
  if not errorlevel 1 (
    start "Rose Enhanced development host" /D "%ROSE_ENHANCED_ROOT%" cmd.exe /k npm start
    exit /b 0
  )
)

echo Rose Enhanced is not installed or packaged yet.
echo.
echo From this folder, install Node.js 22 and npm 11, then run:
echo   npm install
echo   npm run package
echo.
echo You can then double-click this file again.
pause
exit /b 1
