@echo off
setlocal

set "SUMMONERKIT_ROOT=%~dp0"
set "SUMMONERKIT_EXE="

rem Prefer an installed release, then a package built from this repository.
if exist "%LOCALAPPDATA%\summonerkit\SummonerKit.exe" set "SUMMONERKIT_EXE=%LOCALAPPDATA%\summonerkit\SummonerKit.exe"
if not defined SUMMONERKIT_EXE if exist "%LOCALAPPDATA%\Programs\SummonerKit\SummonerKit.exe" set "SUMMONERKIT_EXE=%LOCALAPPDATA%\Programs\SummonerKit\SummonerKit.exe"
if not defined SUMMONERKIT_EXE if exist "%SUMMONERKIT_ROOT%apps\desktop\out\SummonerKit-win32-x64\SummonerKit.exe" set "SUMMONERKIT_EXE=%SUMMONERKIT_ROOT%apps\desktop\out\SummonerKit-win32-x64\SummonerKit.exe"

if defined SUMMONERKIT_EXE (
  start "" "%SUMMONERKIT_EXE%"
  exit /b 0
)

if exist "%LOCALAPPDATA%\rose_enhanced\Rose Enhanced.exe" (
  echo A legacy Rose Enhanced build was found, but it is not started by this launcher.
  echo Use the current SummonerKit package or run the build commands below.
  echo.
)
if exist "%SUMMONERKIT_ROOT%apps\desktop\out\@rose-enhanced-desktop-win32-x64\Rose Enhanced.exe" (
  echo The repository also contains an old Rose Enhanced build in apps\desktop\out.
  echo It is stale; use apps\desktop\out\SummonerKit-win32-x64\SummonerKit.exe instead.
  echo.
)

rem A source checkout can still be opened after its dependencies are installed.
if exist "%SUMMONERKIT_ROOT%node_modules" (
  where npm >nul 2>&1
  if not errorlevel 1 (
    start "SummonerKit development host" /D "%SUMMONERKIT_ROOT%" cmd.exe /k npm start
    exit /b 0
  )
)

echo SummonerKit is not installed or packaged yet.
echo.
echo From this folder, install Node.js 22 and npm 11, then run:
echo   npm install
echo   npm run package
echo.
echo You can then double-click this file again.
pause
exit /b 1
