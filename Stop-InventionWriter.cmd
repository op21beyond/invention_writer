@echo off
REM Stops listeners on ports 8000 and 5173 without starting servers.
setlocal EnableExtensions

set "ROOT=%~dp0"
cd /d "%ROOT%" || exit /b 1

echo Stopping processes listening on ports 8000 ^(API^) and 5173 ^(Vite^) ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\free-dev-ports.ps1" -CloseHostWindows
timeout /t 2 /nobreak >nul
echo Done.
endlocal
exit /b 0
