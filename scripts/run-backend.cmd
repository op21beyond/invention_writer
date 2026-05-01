@echo off
setlocal EnableExtensions
cd /d "%~dp0.." || exit /b 1

if exist ".venv\Scripts\python.exe" goto :run_venv_root
if exist "backend\.venv\Scripts\python.exe" goto :run_venv_back
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
goto :eof

:run_venv_root
".venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
goto :eof

:run_venv_back
"backend\.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
