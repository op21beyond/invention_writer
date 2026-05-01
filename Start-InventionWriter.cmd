@echo off
REM invention_writer launcher. ASCII-only lines: safe for CMD on any OEM/UTF-8 system.
setlocal EnableExtensions

set "ROOT=%~dp0"
cd /d "%ROOT%" || goto :die_bad_root

echo.
echo === invention_writer: local servers ===
echo.

echo PRE: stop old listeners on ports 8000 ^(API^) and 5173 ^(Vite^) if still running ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\free-dev-ports.ps1" -CloseHostWindows
timeout /t 2 /nobreak >nul
echo.

if exist "%ROOT%.venv\Scripts\python.exe" set "_PY=%ROOT%.venv\Scripts\python.exe"
if not defined _PY if exist "%ROOT%backend\.venv\Scripts\python.exe" set "_PY=%ROOT%backend\.venv\Scripts\python.exe"
if not defined _PY set "_PY=python"

"%_PY%" -c "import fastapi, uvicorn" 2>nul
if errorlevel 1 (
echo Installing Python deps from backend\requirements.txt ...
"%_PY%" -m pip install -r "%ROOT%backend\requirements.txt"
if errorlevel 1 goto :die_deps
)

where npm >nul 2>nul
if errorlevel 1 (
echo ERROR: npm not found. Install Node.js LTS from https://nodejs.org
goto :halt
)

if not exist "%ROOT%frontend\node_modules\" (
echo First run: installing frontend npm packages. This may take a few minutes.
cd /d "%ROOT%frontend"
call npm install
if errorlevel 1 goto :die_npm
cd /d "%ROOT%"
)

echo Starting API window on http://127.0.0.1:8000
start "invention_writer API" cmd /c call "%ROOT%scripts\run-backend.cmd"

echo Starting UI window on http://127.0.0.1:5173
start "invention_writer UI" cmd /c call "%ROOT%scripts\run-frontend.cmd"

echo Waiting a few seconds, then opening browser ...
timeout /t 4 /nobreak >nul
set "APP_URL=http://127.0.0.1:5173/"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%APP_URL%"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%APP_URL%"
) else (
  rem Windows default HTTP handler if Chrome not installed (often Edge).
  start "" "%APP_URL%"
)

echo.
echo Servers are running in the other two titled windows.
echo When you are finished testing, come back HERE and press any key to STOP those servers.
pause >nul

echo.
echo POST: stopping listeners on 8000 ^(API^) and 5173 ^(Vite^) and closing API/UI consoles ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\free-dev-ports.ps1" -CloseHostWindows
timeout /t 2 /nobreak >nul
echo POST done.
goto :done

:die_bad_root
echo ERROR: could not cd to folder of this script.
goto :halt

:die_deps
echo ERROR: pip install failed.
goto :halt

:die_npm
echo ERROR: npm install failed.
cd /d "%ROOT%"
goto :halt

:halt
echo.
pause
endlocal
exit /b 1

:done
endlocal
exit /b 0
